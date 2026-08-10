import fs from 'fs';
import path from 'path';
import { CallStatus, Patient, TranscriptEntry, CallSession, Escalation } from '@wellcall/shared-types';
import { insertTranscriptEntry, insertCall, insertEscalation } from './gateway/db';
import { GatewaySocketManager } from './gateway/socket';
import { extractFields } from '@wellcall/extraction';
import { matchRedFlag } from '@wellcall/qdrant-memory';
import { decideRisk } from '@wellcall/risk-engine';
import { notifyNurseSMS } from './notifyNurseSMS';
import { generateAuditRecord, formatAuditRecordAsText } from '@wellcall/audit-report';

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

  /**
   * Run a fake/simulated script sequence (bundled sample dialogue)
   */
  public async runFakeSequence(
    onTranscript: (entry: TranscriptEntry) => void
  ): Promise<TranscriptEntry[]> {
    this.ring();
    this.connect();

    const sampleScriptPath = path.join(__dirname, '../data/sample_dialogue.json');
    let dialogue: { speaker: 'patient' | 'system'; text: string }[] = [
      { speaker: 'system', text: 'Hello John, this is WellCall checking in after your heart surgery. How are you doing today?' },
      { speaker: 'patient', text: 'My chest feels tight when I try to take deep breaths' },
      { speaker: 'system', text: 'I understand you are experiencing chest tightness. I am notifying your care team and escalating to a nurse immediately.' },
    ];

    if (fs.existsSync(sampleScriptPath)) {
      try {
        const raw = fs.readFileSync(sampleScriptPath, 'utf-8');
        dialogue = JSON.parse(raw);
      } catch (e) {
        // fallback
      }
    }

    const generated: TranscriptEntry[] = [];
    for (const d of dialogue) {
      const entry: TranscriptEntry = {
        id: `tr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        callId: this.context.callId,
        speaker: d.speaker,
        text: d.text,
        timestamp: new Date().toISOString(),
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
      const callId = await telephonyClient.initiateWebRTCCall(this.context.patient.id);
      session = {
        id: callId,
        patientId: this.context.patient.id,
        status: 'connected',
        startedAt: new Date().toISOString(),
      } as CallSession;
    } else {
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
    const greetingText = "Hey, just calling to check in — how are you feeling today?";
    try {
      console.log('[callStateMachine] sending Rime greeting');
      const audioBuffer = await rimeClient.speak(greetingText);
      if (audioBuffer && audioBuffer.byteLength > 0) {
        console.log(`[callStateMachine] [RIME] Emitting greeting audio buffer (${audioBuffer.byteLength} bytes)`);
        if (this.socketManager) {
          this.socketManager.emitVoiceAudio(this.context.callId, audioBuffer);
        }
      } else {
        console.warn(`[callStateMachine] [RIME] Empty audio buffer returned for callId ${this.context.callId}: "${greetingText}"`);
      }
      console.log('[callStateMachine] Rime greeting complete');
    } catch (e) {
      console.warn(`[callStateMachine] [RIME] rimeClient.speak failed for callId ${this.context.callId} ("${greetingText}"):`, e);
    }

    // start STT streaming and forward audio from telephony
    const stopStreaming = await sttClient.startStream(async (text: string, isFinal: boolean) => {
      if (!text || text.trim().length === 0) return;
      if (!isFinal) return; // Only process completed final transcript utterances

      const cleanText = text.trim();

      // build TranscriptEntry
      const entry: TranscriptEntry = {
        id: `tr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        callId: this.context.callId,
        speaker: 'patient',
        text: cleanText,
        timestamp: new Date().toISOString(),
      };

      // persist and emit
      await insertTranscriptEntry(entry);
      if (this.socketManager) this.socketManager.emitTranscriptNew(entry);

      // 1. Groq LLM extraction
      const extracted = await extractFields(cleanText, { condition: this.context.patient.condition });
      console.log('[callStateMachine] extraction complete', extracted);

      // 2. Qdrant red flag matching
      const redFlag = await matchRedFlag(this.context.patient.id, extracted.symptom || cleanText);
      console.log('[callStateMachine] qdrant match complete', redFlag);

      // 3. Risk engine decision
      const decision = decideRisk(extracted, redFlag);
      console.log('[callStateMachine] risk-engine decision', decision);

      // 4. If escalated, trigger nurse notification & record
      if (decision.action === 'escalate') {
        const escalation: Escalation = {
          id: `esc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          callId: this.context.callId,
          patientId: this.context.patient.id,
          reason: decision.reason,
          timestamp: new Date().toISOString(),
          acknowledged: false,
        };

        await insertEscalation(escalation);
        if (this.socketManager) this.socketManager.emitEscalationNew(escalation);
        await notifyNurseSMS(escalation, this.context.patient);
      }

      // 5. Generate compliance audit record
      const audit = generateAuditRecord({
        callId: this.context.callId,
        patient: this.context.patient,
        transcript: this.context.transcripts,
        extractedFields: [extracted],
        redFlagMatches: [redFlag],
        finalDecision: decision,
      });

      console.log('[callStateMachine] compliance audit text report:\n', formatAuditRecordAsText(audit));
    });

    // Handle incoming telephony audio chunks -> pass to sttClient
    if (typeof telephonyClient.on === 'function') {
      telephonyClient.on('audio', (chunk: Buffer) => {
        sttClient.sendAudioChunk(chunk);
      });
    }

    // Hangup hook to clean up
    if (typeof telephonyClient.on === 'function') {
      telephonyClient.on('hangup', () => {
        stopStreaming();
        this.hangup();
        if (this.socketManager) this.socketManager.emitCallStatus(this.context.callId, 'ended');
      });
    }
  }
}
