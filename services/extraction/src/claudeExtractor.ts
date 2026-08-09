import { ExtractedFields } from '@wellcall/shared-types';

export interface ExtractionOptions {
  apiKey?: string;
  model?: string;
}

/**
 * Pure function: Extracts structured clinical fields from a transcript chunk via Claude Tool Use.
 * NO HTTP SERVER OR LISTEN() HANDLERS HERE.
 */
export async function extractFields(
  transcriptChunk: string,
  options?: ExtractionOptions
): Promise<ExtractedFields> {
  const apiKey = options?.apiKey || process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) {
    console.warn('[extraction] Warning: ANTHROPIC_API_KEY is not set in environment.');
  }

  // TODO: Call Anthropic Claude messages.create with tool / JSON schema constraint
  return {
    symptom: 'Chest discomfort on inspiration',
    severity: 'moderate',
    mood: 'anxious',
    med_adherence: true,
    notes: 'Extracted in-process from transcript snippet.',
  };
}
