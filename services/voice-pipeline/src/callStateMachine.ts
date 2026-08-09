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
}
