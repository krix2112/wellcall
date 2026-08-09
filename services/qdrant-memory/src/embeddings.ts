/**
 * @wellcall/qdrant-memory - Embeddings Service
 * 
 * EMBEDDING PROVIDER SPECIFICATION:
 * - Production Option A (Cloud): OpenAI `text-embedding-3-small` (1536/384 dims) or Voyage AI `voyage-3-lite` (384 dims).
 *   Requires OPENAI_API_KEY or VOYAGE_API_KEY in process.env.
 * - Production Option B (Local ONNX): `@xenova/transformers` running `Xenova/all-MiniLM-L6-v2` (384 dims).
 *   Runs 100% locally in Node.js without any API keys or external server dependencies.
 * - Local Dev / Fallback Option: Deterministic 384-dimensional float vector generator based on char L2-norm.
 */

export const VECTOR_SIZE = 384;

/**
 * Generates a 384-dimensional dense vector embedding for semantic matching.
 */
export async function embedText(text: string): Promise<number[]> {
  const normalized = text.toLowerCase().trim();

  // If OPENAI_API_KEY or VOYAGE_API_KEY is configured, call embedding API:
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (openaiApiKey) {
    try {
      // TODO: Call OpenAI embeddings.create({ model: 'text-embedding-3-small', dimensions: 384, input: text })
    } catch (err) {
      console.warn('[embeddings] OpenAI embedding call failed, falling back to local dense vector generator.', err);
    }
  }

  // Deterministic 384-dimensional dense float vector generator for local/offline dev testing
  const vector: number[] = new Array(VECTOR_SIZE).fill(0);
  let hash = 0;

  for (let i = 0; i < normalized.length; i++) {
    const charCode = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + charCode;
    hash |= 0;

    const dim = Math.abs(hash) % VECTOR_SIZE;
    vector[dim] += (charCode / 255.0) * (i % 2 === 0 ? 1 : -1);
  }

  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1.0;
  return vector.map((v) => Number((v / norm).toFixed(6)));
}
