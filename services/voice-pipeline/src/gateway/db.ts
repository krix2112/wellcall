import { Patient, CallSession, TranscriptEntry, Escalation } from '@wellcall/shared-types';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * File-backed SQLite / Persistent Gateway Storage Store
 * Mirroring shared-types tables: patients, calls, transcripts, escalations.
 */
export class GatewayDatabase {
  private dbPath: string;
  private data: {
    patients: Record<string, Patient>;
    calls: Record<string, CallSession>;
    transcripts: TranscriptEntry[];
    escalations: Escalation[];
  };

  constructor() {
    const dataDir = path.resolve(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = path.join(dataDir, 'wellcall.db.json');

    this.data = {
      patients: {},
      calls: {},
      transcripts: [],
      escalations: [],
    };

    this.loadDb();
    this.seedFakePatientIfEmpty();
  }

  private loadDb(): void {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        this.data = JSON.parse(raw);
      }
    } catch {
      console.warn('[gateway/db] Failed reading wellcall.db.json, initializing fresh store.');
    }
  }

  private saveDb(): void {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[gateway/db] Failed saving DB:', err);
    }
  }

  /**
   * Seed ONE fake patient row on startup if patients table is empty
   */
  public seedFakePatientIfEmpty(): void {
    if (Object.keys(this.data.patients).length === 0) {
      const seedPatient: Patient = {
        id: 'patient-01',
        name: 'Jane Smith (Seeded Demo)',
        condition: 'Post-Coronary Artery Bypass Graft (CABG)',
        medications: [
          { name: 'Aspirin', dosage: '81mg', frequency: 'Once daily', purpose: 'Antiplatelet' },
          { name: 'Atorvastatin', dosage: '40mg', frequency: 'At bedtime', purpose: 'Lipid control' },
        ],
        followUpDate: '2026-08-15',
        redFlagSymptoms: [
          'Sudden chest tightness or heavy sternal pressure',
          'Shortness of breath while resting',
          'Rapid weight gain over 3 lbs in 24 hours',
        ],
      };
      this.data.patients[seedPatient.id] = seedPatient;
      this.saveDb();
      console.log('[gateway/db] Seeded initial fake patient row: patient-01');
    }
  }

  // --- Exported Typed Queries ---

  public async insertPatient(patient: Patient): Promise<void> {
    this.data.patients[patient.id] = patient;
    this.saveDb();
  }

  public async getPatients(): Promise<Patient[]> {
    return Object.values(this.data.patients);
  }

  public async getPatientById(id: string): Promise<Patient | null> {
    return this.data.patients[id] || null;
  }

  public async insertCall(call: CallSession): Promise<void> {
    this.data.calls[call.id] = call;
    this.saveDb();
  }

  public async getCallById(id: string): Promise<CallSession | null> {
    return this.data.calls[id] || null;
  }

  public async insertTranscriptEntry(entry: TranscriptEntry): Promise<void> {
    this.data.transcripts.push(entry);
    this.saveDb();
  }

  public async getTranscriptsByCallId(callId: string): Promise<TranscriptEntry[]> {
    return this.data.transcripts.filter((t) => t.callId === callId);
  }

  public async insertEscalation(escalation: Escalation): Promise<void> {
    this.data.escalations.push(escalation);
    this.saveDb();
  }

  public async getAllAudit(): Promise<{ escalations: Escalation[]; calls: CallSession[] }> {
    return {
      escalations: [...this.data.escalations],
      calls: Object.values(this.data.calls),
    };
  }
}

export const db = new GatewayDatabase();

export const insertPatient = db.insertPatient.bind(db);
export const getPatients = db.getPatients.bind(db);
export const getPatientById = db.getPatientById.bind(db);
export const insertCall = db.insertCall.bind(db);
export const getCallById = db.getCallById.bind(db);
export const insertTranscriptEntry = db.insertTranscriptEntry.bind(db);
export const insertEscalation = db.insertEscalation.bind(db);
export const getAllAudit = db.getAllAudit.bind(db);
