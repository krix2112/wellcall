import fs from 'fs';
import path from 'path';
import { CallStatus, Patient, TranscriptEntry, CallSession, Escalation } from '@wellcall/shared-types';
import { insertTranscriptEntry, insertCall, insertEscalation } from './gateway/db';
import { GatewaySocketManager } from './gateway/socket';
import { extractFields } from '@wellcall/extraction';
import { matchRedFlag } from '@wellcall/qdrant-memory';
import { decideRisk } from '@wellcall/risk-engine';

export interface CallMachineContext {
  callId: string;
  patient: Patient;
  status: CallStatus;
  transcripts: TranscriptEntry[];
  isFakeMode: boolean;
}

export class CallStateMachine {
  private context: CallMachineContext;
  private socketManager: GatewaySocketManager | null = null;

  constructor(callId: string, patient: Patient, isFakeMode = true) {
    this.context = {
      callId,
      patient,
      status: 'idle',
      transcripts: [],
      isFakeMode,
    };
  }

  public attachSocketManager(sm: GatewaySocketManager) {
    this.socketManager = sm;
  }

  public getStatus(): CallStatus {
    return this.context.status;
  }

  public getContext(): CallMachineContext {
    return { ...this.context };
  }

  public ring(): CallStatus {
    this.context.status = 'ringing';
    return this.context.status;
  }

  public connect(): CallStatus {
    this.context.status = 'connected';
    return this.context.status;
  }

  public hangup(): CallStatus {
    this.context.status = 'ended';
    return this.context.status;
  }

  public async runFakeDemoSession(
    onTranscript: (entry: TranscriptEntry) => void
  ): Promise<TranscriptEntry[]> {
    this.ring();
    await new Promise((r) => setTimeout(r, 500));
    this.connect();

    const fakeDialogues = [
      { speaker: 'system' as const, text: `Hello ${this.context.patient.name}, this is Wellcall checking in on your recovery.` },
      { speaker: 'patient' as const, text: `Hello. I woke up today and my chest feels tight when I take deep breaths.` },
    ];

    const generated: TranscriptEntry[] = [];
    for (const d of fakeDialogues) {
      const entry: TranscriptEntry = {
        id: `tr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        callId: this.context.callId,
        timestamp: new Date().toISOString(),
        speaker: d.speaker,
        text: d.text,
      };
      this.context.transcripts.push(entry);
      generated.push(entry);
      onTranscript(entry);
    }

    this.hangup();
    return generated;
  }

  /**
   * Run a live call orchestration connecting telephony -> stt -> extraction -> risk -> gateway.
   * Components are injected to keep this class testable.
   */
  public async runLiveCall(options: {
    telephonyClient: any;
    sttClient: any;
    rimeClient: any;
  }): Promise<void> {
    const { telephonyClient, sttClient, rimeClient } = options;

    // 1) ring
    this.ring();
    if (this.socketManager) this.socketManager.emitCallStatus(this.context.callId, 'ringing');

    // 2) start telephony session
    let session: CallSession;
    if (typeof telephonyClient.startCall === 'function') {
      session = await telephonyClient.startCall(this.context.patient.id);
    } else if (typeof telephonyClient.initiateWebRTCCall === 'function') {
      // TelephonyClient provides a WebRTC initiation helper that returns a call id string
      const callId = await telephonyClient.initiateWebRTCCall(this.context.patient.id);
      session = {
        id: callId,
        patientId: this.context.patient.id,
        status: 'connected',
        startedAt: new Date().toISOString(),
      } as CallSession;
    } else {
      // Best-effort fallback: start the telephony server if available and synthesize a call session
      if (typeof telephonyClient.startServer === 'function') {
        telephonyClient.startServer();
      }
      session = {
        id: `call-local-${Date.now()}`,
        patientId: this.context.patient.id,
        status: 'connected',
        startedAt: new Date().toISOString(),
      } as CallSession;
    }
    this.context.callId = session.id;
    await insertCall(session);

    // 3) connected
    this.connect();
    if (this.socketManager) this.socketManager.emitCallStatus(this.context.callId, 'connected');

    // speak greeting
    try {
      console.log('[callStateMachine] sending Rime greeting');
      await rimeClient.speak(
        "Hey, just calling to check in — how are you feeling today?"
      );
      console.log('[callStateMachine] Rime greeting complete');
    } catch (e) {
      console.warn('[callStateMachine] rimeClient.speak failed', e);
    }

    // start STT streaming and forward audio from telephony
    // STTClient exposes `startStream(onTranscriptChunk)` which returns a stop function.
    const stopStreaming = await sttClient.startStream(async (text: string) => {
      if (!text) return;

      // build TranscriptEntry
      const entry: TranscriptEntry = {
        id: `tr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        callId: this.context.callId,
        speaker: 'patient',
        text,
        timestamp: new Date().toISOString(),
      };

      // persist and emit
      await insertTranscriptEntry(entry);
      if (this.socketManager) this.socketManager.emitTranscriptNew(entry);

      // extraction
      const extracted = await extractFields(text, { condition: this.context.patient.condition });
      console.log('[callStateMachine] extraction complete', extracted);

      // red flag matching
      const redFlag = await matchRedFlag(this.context.patient.id, extracted.symptom || '');
      console.log('[callStateMachine] qdrant match complete', redFlag);

      // risk decision
      const decision = decideRisk(extracted, redFlag);
      console.log('[callStateMachine] risk-engine decision', decision);

      if (decision.action === 'escalate') {
        // create escalation record
        const esc: Escalation = {
          id: `esc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          callId: this.context.callId,
          patientId: this.context.patient.id,
          reason: decision.reason,
          timestamp: new Date().toISOString(),
          acknowledged: false,
        };
        await insertEscalation(esc);
        if (this.socketManager) this.socketManager.emitEscalationNew(esc);

        try {
          console.log('[callStateMachine] sending Rime escalation prompt');
          await rimeClient.speak("Hmm, that sounds like something a nurse should hear about. One sec, I'm going to connect you now.");
          console.log('[callStateMachine] Rime escalation prompt complete');
        } catch (e) {
          console.warn('[callStateMachine] rimeClient.speak for escalation failed', e);
        }
      }
    });

    // forward telephony audio to sttClient until call ends
    const audioHandler = (chunk: Buffer) => {
      try {
        if (typeof sttClient.sendAudioChunk === 'function') {
          sttClient.sendAudioChunk(chunk);
        }
        // else: STT client may not accept raw audio chunks in this demo stub
      } catch (e) {
        console.error('[callStateMachine] Failed sending audio chunk to sttClient', e);
      }
    };
    // attach to both direct callback and event emitter for flexibility
    try { telephonyClient.onAudioChunk && telephonyClient.onAudioChunk(audioHandler); } catch (_) {}
    try { telephonyClient.on && telephonyClient.on('audio', audioHandler); } catch (_) {}

    // Demo audio playback: stream the bundled WAV sample only after the audio
    // listener is attached so Deepgram receives the full file.
    const wavPath = path.resolve(__dirname, '../test/test-rime-output.wav');
    if (fs.existsSync(wavPath)) {
      const wav = fs.readFileSync(wavPath);
      const pcmStart = 44;
      const chunkSize = 4000;
      console.log(`[callStateMachine] streaming demo WAV audio from ${wavPath}`);
      setTimeout(() => {
        (async () => {
          for (let offset = pcmStart; offset < wav.length; offset += chunkSize) {
            const slice = wav.slice(offset, Math.min(offset + chunkSize, wav.length));
            telephonyClient.emit('audio', slice);
            await new Promise((r) => setTimeout(r, 100));
          }
          telephonyClient.emit('end');
        })().catch((e) => console.error('[callStateMachine] demo audio stream failed', e));
      }, 1000);
    } else {
      console.warn(`[callStateMachine] demo WAV sample not found at ${wavPath}`);
    }

    // wait for telephony end event (simple approach: listen for 'end' on telephonyClient if available)
    const waitForEnd = new Promise<void>((resolve) => {
      telephonyClient.once && telephonyClient.once('end', () => resolve());
      // fallback: resolve when telephonyClient.endCall is called externally
    });

    await waitForEnd;
    console.log('[callStateMachine] telephony end received, waiting for Deepgram finalization');
    await new Promise((r) => setTimeout(r, 5000));

    // teardown
    try { telephonyClient.onAudioChunk && telephonyClient.onAudioChunk(() => {}); } catch (_) {}
    try { telephonyClient.off && telephonyClient.off('audio', audioHandler); } catch (_) {}
    try {
      if (typeof stopStreaming === 'function') await stopStreaming();
    } catch (e) {}

    this.hangup();
    if (this.socketManager) this.socketManager.emitCallStatus(this.context.callId, 'ended');
  }
}
