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
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[gateway/db] Failed saving DB:', err);
    }
  }

  /**
   * Seed initial fake patients and demo call history if they don't already exist.
   * Idempotent: uses upsert logic so restarting the gateway won't create duplicates.
   */
  public seedFakePatientIfEmpty(): void {
    // Primary __dirname resolution with process.cwd() fallback
    const candidatePaths = [
      path.resolve(__dirname, '../../../../data/synthetic-patients'),
      path.resolve(__dirname, '../../../data/synthetic-patients'),
      path.resolve(process.cwd(), 'data/synthetic-patients'),
      path.resolve(process.cwd(), '../../data/synthetic-patients'),
    ];

    let synthDir: string | null = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        synthDir = p;
        break;
      }
    }

    let loadedCount = 0;
    if (synthDir) {
      try {
        const files = fs.readdirSync(synthDir).filter((f) => f.endsWith('.json'));
        for (const file of files) {
          const raw = fs.readFileSync(path.join(synthDir, file), 'utf-8');
          const p = JSON.parse(raw) as Patient;
          if (p && p.id && p.name) {
            this.data.patients[p.id] = p;
            loadedCount++;
          }
        }
        console.log(`[gateway/db] Loaded ${loadedCount} synthetic patients from ${synthDir}`);
      } catch (err) {
        console.warn(`[gateway/db] Failed loading synthetic patients from ${synthDir}:`, err);
      }
    } else {
      console.warn('[gateway/db] Could not locate data/synthetic-patients directory in any candidate path.');
    }

    // Only insert fallback seed patient if no patient-01 exists yet
    if (!this.data.patients['patient-01']) {
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
      console.log('[gateway/db] Ensured fallback seed patient exists: patient-01');
    }

    // Upsert demo calls (idempotent — won't duplicate on restart)
    const demoCall1: CallSession = {
      id: 'call-demo-101',
      patientId: 'patient-01',
      status: 'ended',
      startedAt: '2026-08-09T18:11:00.000Z',
      endedAt: '2026-08-09T18:15:30.000Z',
    };
    const demoCall2: CallSession = {
      id: 'call-demo-100',
      patientId: 'patient-01',
      status: 'ended',
      startedAt: '2026-08-08T09:30:00.000Z',
      endedAt: '2026-08-08T09:33:15.000Z',
    };
    this.data.calls[demoCall1.id] = demoCall1;
    this.data.calls[demoCall2.id] = demoCall2;
    console.log('[gateway/db] Ensured demo call history exists for patient-01');

    // Upsert demo escalation (idempotent)
    const existingEscIdx = this.data.escalations.findIndex((e) => e.id === 'esc-demo-101');
    if (existingEscIdx !== -1) {
      this.data.escalations[existingEscIdx] = {
        id: 'esc-demo-101',
        callId: 'call-demo-101',
        patientId: 'patient-01',
        reason: "Patient's description matches a known high-risk pattern: 'Sudden chest tightness or heavy sternal pressure'",
        timestamp: '2026-08-09T18:12:00.000Z',
        acknowledged: false,
      };
    } else {
      this.data.escalations.push({
        id: 'esc-demo-101',
        callId: 'call-demo-101',
        patientId: 'patient-01',
        reason: "Patient's description matches a known high-risk pattern: 'Sudden chest tightness or heavy sternal pressure'",
        timestamp: '2026-08-09T18:12:00.000Z',
        acknowledged: false,
      });
    }
    console.log('[gateway/db] Ensured demo escalation record exists: esc-demo-101');

    this.saveDb();
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

  public async getCallsByPatientId(patientId: string): Promise<CallSession[]> {
    return Object.values(this.data.calls)
      .filter((c) => c.patientId === patientId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
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

  public async acknowledgeEscalation(id: string): Promise<boolean> {
    const item = this.data.escalations.find((e) => e.id === id);
    if (item) {
      item.acknowledged = true;
      this.saveDb();
      return true;
    }
    return false;
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
export const getCallsByPatientId = db.getCallsByPatientId.bind(db);
export const insertTranscriptEntry = db.insertTranscriptEntry.bind(db);
export const getTranscriptsByCallId = db.getTranscriptsByCallId.bind(db);
export const insertEscalation = db.insertEscalation.bind(db);
export const acknowledgeEscalation = db.acknowledgeEscalation.bind(db);
export const getAllAudit = db.getAllAudit.bind(db);
