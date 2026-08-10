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
    const session: CallSession = await telephonyClient.startCall(this.context.patient.id);
    this.context.callId = session.id;
    await insertCall(session);

    // 3) connected
    this.connect();
    if (this.socketManager) this.socketManager.emitCallStatus(this.context.callId, 'connected');

    // speak greeting
    try {
      await rimeClient.speak(
        "Hey, just calling to check in — how are you feeling today?"
      );
    } catch (e) {
      console.warn('[callStateMachine] rimeClient.speak failed', e);
    }

    // start STT streaming and forward audio from telephony
    await sttClient.startStreaming(async (text: string, isFinal: boolean) => {
      if (!isFinal) return;

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

      // red flag matching
      const redFlag = await matchRedFlag(this.context.patient.id, extracted.symptom || '');

      // risk decision
      const decision = decideRisk(extracted, redFlag);

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
          await rimeClient.speak("Hmm, that sounds like something a nurse should hear about. One sec, I'm going to connect you now.");
        } catch (e) {
          console.warn('[callStateMachine] rimeClient.speak for escalation failed', e);
        }
      }
    });

    // forward telephony audio to sttClient until call ends
    const audioHandler = (chunk: Buffer) => {
      try {
        sttClient.sendAudioChunk(chunk);
      } catch (e) {
        console.error('[callStateMachine] Failed sending audio chunk to sttClient', e);
      }
    };
    // attach to both direct callback and event emitter for flexibility
    try { telephonyClient.onAudioChunk && telephonyClient.onAudioChunk(audioHandler); } catch (_) {}
    try { telephonyClient.on && telephonyClient.on('audio', audioHandler); } catch (_) {}

    // wait for telephony end event (simple approach: listen for 'end' on telephonyClient if available)
    const waitForEnd = new Promise<void>((resolve) => {
      telephonyClient.once && telephonyClient.once('end', () => resolve());
      // fallback: resolve when telephonyClient.endCall is called externally
    });

    await waitForEnd;

    // teardown
    try { telephonyClient.onAudioChunk && telephonyClient.onAudioChunk(() => {}); } catch (_) {}
    try { telephonyClient.off && telephonyClient.off('audio', audioHandler); } catch (_) {}
    try {
      sttClient.stop();
    } catch (e) {}

    this.hangup();
    if (this.socketManager) this.socketManager.emitCallStatus(this.context.callId, 'ended');
  }
}
