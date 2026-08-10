import { ensureCollection, qdrantClient, fallbackPointStore } from './qdrantClient';
import { seedPatientCarePlan, RED_FLAGS_COLLECTION } from './carePlanStore';
import { VECTOR_SIZE } from './embeddings';
import { Patient } from '@wellcall/shared-types';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Programmatic entry point: seeds red-flag vectors from the synthetic patient JSON files.
 * Used by the gateway bootstrap so the in-memory fallback store is populated at startup
 * when the Qdrant server (Cloud or local) is unreachable.
 */
export async function seedRedFlags(): Promise<void> {
  console.log('--- Starting Qdrant Red-Flag Seed ---');

  await ensureCollection(RED_FLAGS_COLLECTION, VECTOR_SIZE);

  // Create a payload index on patientId so we can filter search queries by patient
  try {
    await qdrantClient.createPayloadIndex(RED_FLAGS_COLLECTION, {
      field_name: 'patientId',
      field_schema: 'keyword',
    });
    console.log(`[seedRedFlags] Created payload index on "patientId" for collection "${RED_FLAGS_COLLECTION}".`);
  } catch (err) {
    // Index might already exist or the server might reject duplicate creation
    console.log(`[seedRedFlags] Payload index on "patientId" may already exist: ${err instanceof Error ? err.message : err}`);
  }

  const dataDir = path.resolve(__dirname, '../../../data/synthetic-patients');
  if (!fs.existsSync(dataDir)) {
    console.warn(`[seedRedFlags] Data directory not found at ${dataDir} — skipping seed.`);
    return;
  }

  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
  console.log(`[seedRedFlags] Found ${files.length} synthetic patient files`);

  const patients: Patient[] = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
    const patient = JSON.parse(content) as Patient;
    patients.push(patient);
  }

  for (const patient of patients) {
    await seedPatientCarePlan(patient);
  }

  // Report where vectors landed
  try {
    const countResult = await qdrantClient.count(RED_FLAGS_COLLECTION);
    console.log(`[seedRedFlags] Total points in Qdrant server: ${countResult.count}`);
  } catch {
    const fallbackPoints = fallbackPointStore.get(RED_FLAGS_COLLECTION) || [];
    console.log(`[seedRedFlags] Using in-memory fallback store: ${fallbackPoints.length} points`);
  }

  console.log('--- Qdrant Red-Flag Seed completed ---');
}

async function runSeed() {
  await seedRedFlags();
  process.exit(0);
}

if (require.main === module) {
  runSeed().catch((err) => {
    console.error('Seed process failed:', err);
    process.exit(1);
  });
}
