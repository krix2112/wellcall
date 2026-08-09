import { CallStatus, Patient, TranscriptEntry } from '@wellcall/shared-types';

export interface CallMachineContext {
  callId: string;
  patient: Patient;
  status: CallStatus;
  transcripts: TranscriptEntry[];
  isFakeMode: boolean;
}

export class CallStateMachine {
  private context: CallMachineContext;

  constructor(callId: string, patient: Patient, isFakeMode = true) {
    this.context = {
      callId,
      patient,
      status: 'idle',
      transcripts: [],
      isFakeMode,
    };
  }

  public getStatus(): CallStatus {
    return this.context.status;
  }

  public getContext(): CallMachineContext {
    return { ...this.context };
  }

  /**
   * Start ringing patient
   */
  public ring(): CallStatus {
    this.context.status = 'ringing';
    console.log(`[callStateMachine] Call ${this.context.callId} status -> ringing`);
    return this.context.status;
  }

  /**
   * Connect call session
   */
  public connect(): CallStatus {
    this.context.status = 'connected';
    console.log(`[callStateMachine] Call ${this.context.callId} status -> connected`);
    return this.context.status;
  }

  /**
   * Hang up / end call session
   */
  public hangup(): CallStatus {
    this.context.status = 'ended';
    console.log(`[callStateMachine] Call ${this.context.callId} status -> ended`);
    return this.context.status;
  }

  /**
   * Standalone Fake Mode Runner for Phase 1 testing without live audio stream
   */
  public async runFakeDemoSession(
    onTranscript: (entry: TranscriptEntry) => void
  ): Promise<TranscriptEntry[]> {
    this.ring();
    await new Promise((r) => setTimeout(r, 500));
    this.connect();

    const fakeDialogues = [
      { speaker: 'agent' as const, text: `Hello ${this.context.patient.name}, this is Wellcall checking in on your post-discharge recovery.` },
      { speaker: 'patient' as const, text: `Hello. I woke up today and my chest feels tight when I take deep breaths.` },
    ];

    const generated: TranscriptEntry[] = [];
    for (const d of fakeDialogues) {
      const entry: TranscriptEntry = {
        id: `tr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        callId: this.context.callId,
        patientId: this.context.patient.id,
        timestamp: new Date().toISOString(),
        speaker: d.speaker,
        text: d.text,
        isFinal: true,
      };
      this.context.transcripts.push(entry);
      generated.push(entry);
      onTranscript(entry);
    }

    this.hangup();
    return generated;
  }
}
