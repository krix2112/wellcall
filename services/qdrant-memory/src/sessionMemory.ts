import { MemoryEntry } from '@wellcall/shared-types';
import { ensureCollection, fallbackPointStore, qdrantFetch, qdrantClient, StoredVectorPoint } from './qdrantClient';
import { embedText, VECTOR_SIZE } from './embeddings';

export const SESSION_MEMORY_COLLECTION = 'patient_session_memory';

/**
 * Ensures session memory collection is initialized in Qdrant
 */
export async function ensureSessionMemoryCollection(): Promise<void> {
  await ensureCollection(SESSION_MEMORY_COLLECTION, VECTOR_SIZE);
  try {
    await qdrantClient.createPayloadIndex(SESSION_MEMORY_COLLECTION, {
      field_name: 'patientId',
      field_schema: 'keyword',
    });
  } catch { /* ignore if index exists */ }
}

/**
 * Set a new persistent memory entry for a patient.
 * Embeds summaryText and upserts point into Qdrant "patient_session_memory" collection.
 */
export async function setMemory(
  patientId: string,
  callId: string,
  summaryText: string,
  category: MemoryEntry['category'],
  wasEscalated?: boolean
): Promise<MemoryEntry> {
  await ensureSessionMemoryCollection();

  const memoryId = `mem_${patientId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const numericId = Math.abs(hashCode(memoryId)) + 20000;
  const createdAt = new Date().toISOString();

  const entry: MemoryEntry = {
    id: memoryId,
    patientId,
    callId,
    summaryText,
    category,
    wasEscalated: !!wasEscalated,
    createdAt,
    deleted: false,
  };

  const vector = await embedText(summaryText);
  const payload = {
    ...entry,
    numericId,
  };

  try {
    const res = await qdrantFetch(`/collections/${SESSION_MEMORY_COLLECTION}/points`, {
      method: 'PUT',
      body: JSON.stringify({
        points: [
          {
            id: numericId,
            vector,
            payload,
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`Qdrant upsert returned HTTP ${res.status}`);
    }
    console.log(`[sessionMemory] Successfully set memory ${memoryId} (point ID: ${numericId}) in Qdrant.`);
  } catch (err) {
    console.warn(`[sessionMemory] Qdrant server unreachable. Saving memory ${memoryId} to fallback store.`, err);
    const points = fallbackPointStore.get(SESSION_MEMORY_COLLECTION) || [];
    const point: StoredVectorPoint = {
      id: numericId,
      vector,
      payload: { ...payload, riskTier: 'low', flagText: summaryText },
    };
    fallbackPointStore.set(SESSION_MEMORY_COLLECTION, [...points, point]);
  }

  return entry;
}

/**
 * Retrieve patient's memory entries, filtered by patientId, EXCLUDING deleted entries, most recent first.
 */
export async function getMemory(patientId: string, limit: number = 10): Promise<MemoryEntry[]> {
  await ensureSessionMemoryCollection();

  try {
    const res = await qdrantClient.scroll(SESSION_MEMORY_COLLECTION, {
      filter: {
        must: [
          {
            key: 'patientId',
            match: { value: patientId },
          },
        ],
      },
      limit: limit * 2,
      with_payload: true,
    });

    const points = res.points || [];
    const entries = points
      .map((p) => p.payload as unknown as MemoryEntry)
      .filter((m) => m && !m.deleted);

    return entries
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  } catch (err) {
    console.warn('[sessionMemory] Using fallback memory retrieval.', err);
    const points = fallbackPointStore.get(SESSION_MEMORY_COLLECTION) || [];
    return points
      .map((p) => p.payload as unknown as MemoryEntry)
      .filter((m) => m && m.patientId === patientId && !m.deleted)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
}

/**
 * Correct an existing memory entry by memoryId.
 * Re-embeds corrected text, updates existing point's payload without creating a duplicate point!
 */
export async function correctMemory(memoryId: string, newSummaryText: string): Promise<MemoryEntry> {
  await ensureSessionMemoryCollection();

  const scrollRes = await qdrantFetch(`/collections/${SESSION_MEMORY_COLLECTION}/points/scroll`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        must: [{ key: 'id', match: { value: memoryId } }],
      },
      limit: 1,
      with_payload: true,
    }),
  });

  if (!scrollRes.ok) throw new Error(`Could not find memory ${memoryId} to correct`);
  const data = (await scrollRes.json()) as {
    result: {
      points: Array<{
        id: number;
        payload: MemoryEntry & { numericId: number };
      }>;
    };
  };

  if (!data.result?.points || data.result.points.length === 0) {
    throw new Error(`Memory entry with id "${memoryId}" not found in Qdrant.`);
  }

  const existingPoint = data.result.points[0];
  const numericId = existingPoint.id;
  const updatedEntry: MemoryEntry = {
    ...existingPoint.payload,
    summaryText: newSummaryText,
    correctedAt: new Date().toISOString(),
  };

  const newVector = await embedText(newSummaryText);
  await qdrantFetch(`/collections/${SESSION_MEMORY_COLLECTION}/points`, {
    method: 'PUT',
    body: JSON.stringify({
      points: [
        {
          id: numericId,
          vector: newVector,
          payload: updatedEntry,
        },
      ],
    }),
  });

  console.log(`[sessionMemory] Corrected memory point ${numericId} (memoryId: ${memoryId}) without duplication.`);
  return updatedEntry;
}

/**
 * Soft delete a memory entry by memoryId (sets deleted: true in payload for audit trail).
 */
export async function deleteMemory(memoryId: string): Promise<void> {
  await ensureSessionMemoryCollection();

  const scrollRes = await qdrantFetch(`/collections/${SESSION_MEMORY_COLLECTION}/points/scroll`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        must: [{ key: 'id', match: { value: memoryId } }],
      },
      limit: 1,
      with_payload: true,
    }),
  });

  if (!scrollRes.ok) throw new Error(`Could not find memory ${memoryId} to delete`);
  const data = (await scrollRes.json()) as {
    result: {
      points: Array<{
        id: number;
        payload: MemoryEntry;
      }>;
    };
  };

  if (!data.result?.points || data.result.points.length === 0) {
    throw new Error(`Memory entry with id "${memoryId}" not found in Qdrant.`);
  }

  const existingPoint = data.result.points[0];
  const numericId = existingPoint.id;

  await qdrantFetch(`/collections/${SESSION_MEMORY_COLLECTION}/points/payload`, {
    method: 'POST',
    body: JSON.stringify({
      payload: { deleted: true },
      points: [numericId],
    }),
  });

  console.log(`[sessionMemory] Soft-deleted memory point ${numericId} (memoryId: ${memoryId}) with deleted: true.`);
}

/**
 * Retrieve semantically relevant memories for current context, filtered by patientId and excluding deleted memories.
 */
export async function getRelevantMemory(
  patientId: string,
  currentContext: string,
  limit: number = 3
): Promise<MemoryEntry[]> {
  await ensureSessionMemoryCollection();

  const contextVector = await embedText(currentContext);
  const res = await qdrantFetch(`/collections/${SESSION_MEMORY_COLLECTION}/points/search`, {
    method: 'POST',
    body: JSON.stringify({
      vector: contextVector,
      filter: {
        must: [
          { key: 'patientId', match: { value: patientId } },
        ],
        must_not: [
          { key: 'deleted', match: { value: true } },
        ],
      },
      limit,
      with_payload: true,
    }),
  });

  if (!res.ok) throw new Error(`Qdrant relevant memory search returned HTTP ${res.status}`);

  const data = (await res.json()) as {
    result: Array<{
      id: number;
      score: number;
      payload: MemoryEntry;
    }>;
  };

  const results = data.result || [];
  console.log(`[sessionMemory] Relevant memory search for context "${currentContext}":`);
  results.forEach((r) => {
    console.log(`  -> Score: ${r.score.toFixed(4)} | Memory: "${r.payload.summaryText}"`);
  });

  return results.map((r) => r.payload);
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
