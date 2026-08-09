import { Patient, CallSession, TranscriptEntry, Escalation } from '@wellcall/shared-types';

/**
 * SQLite Persistence Layer Stub
 * Tables mirroring @wellcall/shared-types: patients, calls, transcripts, escalations.
 */
export class GatewayDatabase {
  private patients: Map<string, Patient> = new Map();
  private calls: Map<string, CallSession> = new Map();
  private transcripts: TranscriptEntry[] = [];
  private escalations: Escalation[] = [];

  constructor() {
    this.initSchema();
  }

  private initSchema(): void {
    console.log('[gateway/db] Initializing SQLite schema: patients, calls, transcripts, escalations tables.');
    // TODO: Initialize SQLite tables (e.g., CREATE TABLE IF NOT EXISTS patients ...)
  }

  // Patient Queries
  public async getPatients(): Promise<Patient[]> {
    return Array.from(this.patients.values());
  }

  public async getPatientById(id: string): Promise<Patient | null> {
    return this.patients.get(id) || null;
  }

  public async savePatient(patient: Patient): Promise<void> {
    this.patients.set(patient.id, patient);
  }

  // Call Session Queries
  public async saveCallSession(session: CallSession): Promise<void> {
    this.calls.set(session.id, session);
  }

  public async getCallById(id: string): Promise<CallSession | null> {
    return this.calls.get(id) || null;
  }

  // Transcript Entry Queries
  public async saveTranscript(entry: TranscriptEntry): Promise<void> {
    this.transcripts.push(entry);
  }

  public async getTranscriptsByCallId(callId: string): Promise<TranscriptEntry[]> {
    return this.transcripts.filter((t) => t.callId === callId);
  }

  // Escalation Queries
  public async saveEscalation(escalation: Escalation): Promise<void> {
    this.escalations.push(escalation);
  }

  public async getEscalations(): Promise<Escalation[]> {
    return [...this.escalations];
  }
}

export const db = new GatewayDatabase();
