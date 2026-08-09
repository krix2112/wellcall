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
    const transformers = await (eval('import("@xenova/transformers")') as Promise<any>);
    extractorPipeline = await transformers.pipeline('feature-extraction', EMBEDDING_MODEL_NAME);
  }
  return extractorPipeline;
}

/**
 * Generates 384-dimensional semantic dense float vector using Xenova/all-MiniLM-L6-v2.
 */
export async function embedText(text: string): Promise<number[]> {
  const extractor = await getExtractorPipeline();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data) as number[];
}
