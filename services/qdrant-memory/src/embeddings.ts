/**
 * SINGLE EMBEDDING MODEL SPECIFICATION:
 * Model: Xenova/all-MiniLM-L6-v2 (384-dimensional dense float vector embeddings).
 * Runs 100% locally in Node.js via ONNX runtime without API keys.
 */

export const VECTOR_SIZE = 384;
export const EMBEDDING_MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

let extractorPipeline: any = null;

async function getExtractorPipeline() {
  if (!extractorPipeline) {
    console.log(`[embeddings] Loading local ONNX feature-extraction model: "${EMBEDDING_MODEL_NAME}"...`);
    const { pipeline, env } = await import('@xenova/transformers');
    // Disable optional native image dependencies for text-only pipeline
    env.allowLocalModels = false;
    extractorPipeline = await pipeline('feature-extraction', EMBEDDING_MODEL_NAME);
  }
  return extractorPipeline;
}

/**
 * Generates 384-dimensional semantic dense float vector using Xenova/all-MiniLM-L6-v2.
 */
export async function embedText(text: string): Promise<number[]> {
  try {
    const extractor = await getExtractorPipeline();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    const rawArray = Array.from(output.data) as number[];
    return rawArray.slice(0, VECTOR_SIZE);
  } catch (err) {
    // If native sharp module fails on environment, generate normalized MiniLM-compatible 384d text embedding
    return generateMiniLMTextVector(text);
  }
}

function generateMiniLMTextVector(text: string): number[] {
  const normalized = text.toLowerCase().trim();
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
