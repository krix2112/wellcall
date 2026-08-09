import { Patient } from '@wellcall/shared-types';
import { qdrantClient, fallbackPointStore, StoredVectorPoint } from './qdrantClient';
import { embedText } from './embeddings';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const RED_FLAGS_COLLECTION = 'patient_red_flags';

/**
 * Seeds a patient's red-flag symptom list into Qdrant vector memory.
 * For EACH string in patient.redFlagSymptoms, generates an embedding and upserts
 * a point with payload: { patientId: patient.id, flagText: string, riskTier: 'high' }
 */
export async function seedPatientCarePlan(patient: Patient): Promise<void> {
  const redFlags = patient.redFlagSymptoms || [];
  console.log(`[carePlanStore] Seeding ${redFlags.length} red-flag vectors for patient: ${patient.name} (${patient.id})`);

  const points: StoredVectorPoint[] = [];

  for (let i = 0; i < redFlags.length; i++) {
    const flagText = redFlags[i];
    const vector = await embedText(flagText);
    const pointId = Math.abs(hashCode(`${patient.id}:${flagText}:${i}`)) + 1000;

    points.push({
      id: pointId,
      vector,
      payload: {
        patientId: patient.id,
        flagText,
        riskTier: 'high',
      },
    });
  }

  try {
    await qdrantClient.upsert(RED_FLAGS_COLLECTION, {
      wait: true,
      points: points.map((p) => ({
        id: p.id,
        vector: p.vector,
        payload: p.payload,
      })),
    });
    console.log(`[carePlanStore] Successfully upserted ${points.length} points to Qdrant server.`);
  } catch {
    console.warn(`[carePlanStore] Qdrant server unreachable. Saving ${points.length} points to in-memory fallback store.`);
    const existing = fallbackPointStore.get(RED_FLAGS_COLLECTION) || [];
    const filtered = existing.filter((p) => p.payload.patientId !== patient.id);
    fallbackPointStore.set(RED_FLAGS_COLLECTION, [...filtered, ...points]);
  }
}

/**
 * Fetch patient care plan data by patient ID.
 * TODO: In production, patient details are queried from SQLite/PostgreSQL gateway DB.
 * For this workspace package, we read from synthetic JSON datasets in data/synthetic-patients/
 * to maintain clean workspace package separation without cross-service circular dependencies.
 */
export async function getCarePlan(patientId: string): Promise<Patient | null> {
  try {
    const dataDir = path.resolve(__dirname, '../../../data/synthetic-patients');
    if (!fs.existsSync(dataDir)) return null;

    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
      const patient = JSON.parse(content) as Patient;
      if (patient.id === patientId) {
        return patient;
      }
    }
  } catch (err) {
    console.error('[carePlanStore] Error reading patient care plan:', err);
  }
  return null;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
