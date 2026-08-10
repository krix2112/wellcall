import assert from 'node:assert';
import { test } from 'node:test';
import {
  setMemory,
  getMemory,
  correctMemory,
  deleteMemory,
  getRelevantMemory,
  ensureSessionMemoryCollection,
  SESSION_MEMORY_COLLECTION,
} from './sessionMemory';
import { qdrantFetch } from './qdrantClient';

async function getQdrantPointCount(): Promise<number> {
  const res = await qdrantFetch(`/collections/${SESSION_MEMORY_COLLECTION}`);
  const data = (await res.json()) as { result: { points_count: number } };
  return data.result.points_count;
}

test('sessionMemory - TEST 1: setMemory then getMemory retrieves record correctly', async () => {
  await ensureSessionMemoryCollection();
  const patientId = `patient-test-01-${Date.now()}`;

  const entry = await setMemory(
    patientId,
    'call-101',
    'Patient reported feeling anxious about upcoming stairs walk',
    'mood'
  );

  assert.ok(entry.id.startsWith('mem_'), 'Memory ID should have mem_ prefix');

  const memories = await getMemory(patientId);
  assert.ok(memories.length >= 1, 'getMemory should return at least 1 memory');
  assert.strictEqual(memories[0].id, entry.id);
  assert.strictEqual(memories[0].summaryText, 'Patient reported feeling anxious about upcoming stairs walk');
});

test('sessionMemory - TEST 2: correctMemory updates existing entry WITHOUT point duplication', async () => {
  await ensureSessionMemoryCollection();
  const patientId = `patient-test-02-${Date.now()}`;

  const initialEntry = await setMemory(
    patientId,
    'call-102',
    'Patient missed taking morning Aspirin dose',
    'med_adherence'
  );

  const countBefore = await getQdrantPointCount();

  const correctedEntry = await correctMemory(
    initialEntry.id,
    'Patient confirmed taking morning Aspirin with breakfast'
  );

  const countAfter = await getQdrantPointCount();

  assert.strictEqual(countAfter, countBefore, 'Point count MUST NOT increase after correctMemory (No Duplication!)');
  assert.strictEqual(correctedEntry.id, initialEntry.id);
  assert.strictEqual(correctedEntry.summaryText, 'Patient confirmed taking morning Aspirin with breakfast');
  assert.ok(correctedEntry.correctedAt !== undefined, 'correctedAt timestamp should be set');
});

test('sessionMemory - TEST 3: deleteMemory soft-deletes entry (deleted: true in Qdrant, filtered out from getMemory)', async () => {
  await ensureSessionMemoryCollection();
  const patientId = `patient-test-03-${Date.now()}`;

  const entry = await setMemory(
    patientId,
    'call-103',
    'Temporary observation note to be removed',
    'general'
  );

  await deleteMemory(entry.id);

  const activeMemories = await getMemory(patientId);
  const foundInActive = activeMemories.some((m) => m.id === entry.id);
  assert.strictEqual(foundInActive, false, 'Soft-deleted memory MUST NOT appear in active getMemory() results');

  // Verify point still exists in Qdrant with deleted: true
  const scrollRes = await qdrantFetch(`/collections/${SESSION_MEMORY_COLLECTION}/points/scroll`, {
    method: 'POST',
    body: JSON.stringify({
      filter: { must: [{ key: 'id', match: { value: entry.id } }] },
      limit: 1,
      with_payload: true,
    }),
  });
  const data = (await scrollRes.json()) as { result: { points: Array<{ payload: { deleted: boolean } }> } };
  assert.strictEqual(data.result.points[0].payload.deleted, true, 'Point MUST still exist in Qdrant with deleted: true');
});

test('sessionMemory - TEST 4: getRelevantMemory semantic search retrieves relevant memory over recent unrelated ones', async () => {
  await ensureSessionMemoryCollection();
  const patientId = `patient-test-04-${Date.now()}`;

  // Seed 2 unrelated memories + 1 semantically target memory
  const mem1 = await setMemory(patientId, 'call-201', 'Patient likes watching baseball games on weekend afternoons', 'general');
  const mem2 = await setMemory(patientId, 'call-202', 'Patient mentioned severe ankle swelling after sitting for 2 hours', 'symptom');
  const mem3 = await setMemory(patientId, 'call-203', 'Patient takes evening walks with neighbor at 5pm', 'general');

  // Query with a semantically related phrase: "my legs and feet are getting puffy"
  const currentContext = 'my legs and feet are getting puffy';
  console.log(`\n--- Running Session Memory Test 4 (Full Similarity Gap Analysis) ---`);
  const relevantMemories = await getRelevantMemory(patientId, currentContext, 5);

  assert.ok(relevantMemories.length >= 3, 'Should return all 3 stored memories in candidate set');
  assert.strictEqual(relevantMemories[0].id, mem2.id, 'Top semantic match MUST be the ankle swelling memory (mem2)');
});
