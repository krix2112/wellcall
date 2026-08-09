import { ensureCollection, qdrantClient, fallbackPointStore } from './qdrantClient';
import { seedPatientCarePlan, RED_FLAGS_COLLECTION } from './carePlanStore';
import { VECTOR_SIZE } from './embeddings';
import { Patient } from '@wellcall/shared-types';
import * as fs from 'node:fs';
import * as path from 'node:path';

async function runSeed() {
  console.log('--- Starting Qdrant Red-Flag Seed Script ---');

  // 1. Ensure collection exists
  await ensureCollection(RED_FLAGS_COLLECTION, VECTOR_SIZE);

  // 2. Read synthetic patient datasets from data/synthetic-patients/
  const dataDir = path.resolve(__dirname, '../../../data/synthetic-patients');
  if (!fs.existsSync(dataDir)) {
    console.error(`Data directory not found at ${dataDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
  console.log(`Found ${files.length} synthetic patient files in data/synthetic-patients/`);

  const patients: Patient[] = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
    const patient = JSON.parse(content) as Patient;
    patients.push(patient);
  }

  // 3. Seed each patient's red flags
  for (const patient of patients) {
    await seedPatientCarePlan(patient);
  }

  // 4. Verify and print points count & example payload
  try {
    const countResult = await qdrantClient.count(RED_FLAGS_COLLECTION);
    const scrollResult = await qdrantClient.scroll(RED_FLAGS_COLLECTION, { limit: 1, with_payload: true });

    console.log('\n=== Qdrant Vector Storage Verification ===');
    console.log(`Total Points Stored in Qdrant: ${countResult.count}`);
    if (scrollResult.points.length > 0) {
      console.log('Example Point Payload:', JSON.stringify(scrollResult.points[0].payload, null, 2));
    }
  } catch {
    const fallbackPoints = fallbackPointStore.get(RED_FLAGS_COLLECTION) || [];
    console.log('\n=== In-Memory Fallback Storage Verification ===');
    console.log(`Total Vector Points Stored: ${fallbackPoints.length}`);
    if (fallbackPoints.length > 0) {
      console.log('Example Point Payload:', JSON.stringify(fallbackPoints[0].payload, null, 2));
    }
  }

  console.log('\n--- Seed Process Completed Successfully ---');
}

runSeed().catch((err) => {
  console.error('Seed process failed:', err);
  process.exit(1);
});
