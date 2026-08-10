import assert from 'node:assert';
import { test, before } from 'node:test';
import { matchRedFlag } from './redFlagMatcher';
import { ensureCollection } from './qdrantClient';
import { seedPatientCarePlan, RED_FLAGS_COLLECTION } from './carePlanStore';
import { VECTOR_SIZE } from './embeddings';
import { Patient } from '@wellcall/shared-types';
import * as fs from 'node:fs';
import * as path from 'node:path';

before(async () => {
  console.log('\n--- Seeding Qdrant vector memory before running test suite ---');
  await ensureCollection(RED_FLAGS_COLLECTION, VECTOR_SIZE);
  const dataDir = path.resolve(__dirname, '../../../data/synthetic-patients');
  if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
      const patient = JSON.parse(content) as Patient;
      await seedPatientCarePlan(patient);
    }
  }
});

test('redFlagMatcher - TEST CASE A (POSITIVE MATCH): Chest tightness for patient-02 (Post-CABG)', async () => {
  const patientId = 'patient-02';
  const spokenText = 'my chest feels tight when I try to take deep breaths';

  console.log(`\n--- Running Test Case A ---`);
  const result = await matchRedFlag(patientId, spokenText);

  assert.strictEqual(result.matched, true, 'Test A should match cardiac red flag');
  assert.ok(result.matchedFlag?.toLowerCase().includes('chest'), 'Matched flag should mention chest');
});

test('redFlagMatcher - TEST CASE B (PARAPHRASED POSITIVE MATCH): Rapid weight gain for patient-03 (CHF)', async () => {
  const patientId = 'patient-03';
  const spokenText = 'I think I gained some weight really fast this week';

  console.log(`\n--- Running Test Case B ---`);
  const result = await matchRedFlag(patientId, spokenText);

  assert.strictEqual(result.matched, true, 'Test B should match CHF fluid weight gain red flag');
  assert.ok(result.matchedFlag?.toLowerCase().includes('weight'), 'Matched flag should mention weight gain');
});

test('redFlagMatcher - TEST CASE C (NEGATIVE CASE): Benign activity for patient-01', async () => {
  const patientId = 'patient-01';
  const spokenText = 'I watched a movie and had a sandwich for lunch';

  console.log(`\n--- Running Test Case C ---`);
  const result = await matchRedFlag(patientId, spokenText);

  assert.strictEqual(result.matched, false, 'Test C should NOT match any red flag');
  assert.strictEqual(result.riskTier, 'low');
});

test('redFlagMatcher - TEST CASE D (CROSS-PATIENT ISOLATION): Query patient-02 red flag with isolated patient ID', async () => {
  const patientId = 'patient-isolation-test-id';
  const spokenText = 'my chest feels tight when I try to take deep breaths';

  console.log(`\n--- Running Test Case D (Cross-Patient Isolation) ---`);
  const result = await matchRedFlag(patientId, spokenText);

  assert.strictEqual(result.matched, false, 'Test D MUST NOT match because patient-isolation-test-id has no red flags');
});
