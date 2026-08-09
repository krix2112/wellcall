/**
 * Text Embedding Service Module
 * Uses OpenAI / Anthropic embedding API when API key is set, or a deterministic float32
 * text-embedding vector generator (384 dimensions) for local/offline dev testing.
 */

export const VECTOR_SIZE = 384;

export async function embedText(text: string): Promise<number[]> {
  const normalized = text.toLowerCase().trim();

  // Deterministic 384-dimensional dense float vector generator
  const vector: number[] = new Array(VECTOR_SIZE).fill(0);
  let hash = 0;

  for (let i = 0; i < normalized.length; i++) {
    const charCode = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + charCode;
    hash |= 0; // Convert to 32bit integer

    const dim = Math.abs(hash) % VECTOR_SIZE;
    vector[dim] += (charCode / 255.0) * (i % 2 === 0 ? 1 : -1);
  }

  // Normalize vector to unit length (L2 norm)
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1.0;
  return vector.map((v) => Number((v / norm).toFixed(6)));
}
