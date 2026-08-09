import { QdrantClient } from '@qdrant/js-client-rest';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || undefined;

export const qdrantClient = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY,
  checkCompatibility: false,
});

export interface StoredVectorPoint {
  id: string | number;
  vector: number[];
  payload: {
    patientId: string;
    flagText: string;
    riskTier: 'high' | 'medium' | 'low';
    [key: string]: unknown;
  };
}

export const fallbackPointStore: Map<string, StoredVectorPoint[]> = new Map();

/**
 * Ensures Qdrant collection exists (idempotent setup).
 */
export async function ensureCollection(
  collectionName: string = 'patient_red_flags',
  vectorSize: number = 384
): Promise<void> {
  try {
    const collections = await qdrantClient.getCollections();
    const exists = collections.collections.some((c) => c.name === collectionName);

    if (!exists) {
      await qdrantClient.createCollection(collectionName, {
        vectors: {
          size: vectorSize,
          distance: 'Cosine',
        },
      });
      console.log(`[qdrantClient] Created Qdrant collection: "${collectionName}" (vectorSize: ${vectorSize})`);
    } else {
      console.log(`[qdrantClient] Collection "${collectionName}" already exists.`);
    }
  } catch (err) {
    console.warn(
      `[qdrantClient] Qdrant server unreachable at ${QDRANT_URL}. Initializing fallback store for collection "${collectionName}".`,
      err
    );
    if (!fallbackPointStore.has(collectionName)) {
      fallbackPointStore.set(collectionName, []);
    }
  }
}
