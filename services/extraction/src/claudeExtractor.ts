import { Anthropic } from '@anthropic-ai/sdk';
import { ExtractedFields } from '@wellcall/shared-types';

export const DEFAULT_EXTRACTED_FIELDS: ExtractedFields = {
  symptom: null,
  severity: null,
  mood: null,
  medAdherence: null,
};

/**
 * Pure workspace package function: Extracts structured clinical fields from patient transcript.
 * Uses Claude Tool Use (function calling) to guarantee valid JSON output shape.
 * NO SERVER CODE / NO HTTP ENDPOINTS HERE.
 */
export async function extractFields(
  transcriptText: string,
  patientContext?: { condition: string }
): Promise<ExtractedFields> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    console.warn('[claudeExtractor] ANTHROPIC_API_KEY is not set or using placeholder. Returning safe default.');
    return parseFallbackHeuristic(transcriptText, patientContext);
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    const conditionHint = patientContext?.condition
      ? `Patient discharge condition context: "${patientContext.condition}". Use this medical condition to accurately evaluate ambiguous or subtle symptom expressions.`
      : 'No prior condition context provided.';

    const systemPrompt = `You are a clinical extraction parser for post-discharge patient follow-up calls.
Extract structured fields strictly from what is explicitly stated or clearly implied in the transcript snippet.
Rules:
1. Do NOT guess or hallucinate symptoms that are not mentioned. Return null if a field is omitted.
2. ${conditionHint}
3. Call the tool "extract_patient_checkin_fields" with your structured extraction result.`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      system: systemPrompt,
      tools: [
        {
          name: 'extract_patient_checkin_fields',
          description: 'Record structured symptoms, severity, mood, and medication adherence from patient check-in dialogue.',
          input_schema: {
            type: 'object',
            properties: {
              symptom: {
                type: ['string', 'null'],
                description: 'The specific symptom or physical complaint described by the patient, or null if none mentioned.',
              },
              severity: {
                type: ['string', 'null'],
                enum: ['none', 'mild', 'moderate', 'severe', null],
                description: 'Severity level of the symptom: none, mild, moderate, severe, or null if not mentioned.',
              },
              mood: {
                type: ['string', 'null'],
                description: 'Brief description of emotional state if expressed (e.g. anxious, reassured, frustrated), or null.',
              },
              medAdherence: {
                type: ['string', 'null'],
                enum: ['yes', 'no', 'unclear', null],
                description: 'Medication adherence status: yes, no, unclear, or null if not mentioned.',
              },
            },
            required: ['symptom', 'severity', 'mood', 'medAdherence'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'extract_patient_checkin_fields' },
      messages: [{ role: 'user', content: transcriptText }],
    });

    // Locate tool use block in response
    const toolUseBlock = response.content.find((block) => block.type === 'tool_use');
    if (toolUseBlock && toolUseBlock.type === 'tool_use') {
      const extracted = toolUseBlock.input as ExtractedFields;
      return {
        symptom: extracted.symptom ?? null,
        severity: extracted.severity ?? null,
        mood: extracted.mood ?? null,
        medAdherence: extracted.medAdherence ?? null,
      };
    }

    return DEFAULT_EXTRACTED_FIELDS;
  } catch (error) {
    console.error('[claudeExtractor] API invocation error:', error);
    return DEFAULT_EXTRACTED_FIELDS;
  }
}

/**
 * Fallback parser for offline development / placeholder API key testing
 */
export function parseFallbackHeuristic(
  transcriptText: string,
  patientContext?: { condition: string }
): ExtractedFields {
  const text = transcriptText.toLowerCase();

  let symptom: string | null = null;
  let severity: 'none' | 'mild' | 'moderate' | 'severe' | null = null;
  let mood: string | null = null;
  let medAdherence: 'yes' | 'no' | 'unclear' | null = null;

  if (text.includes('chest') || text.includes('tight') || text.includes('pain') || text.includes('shortness')) {
    symptom = text.includes('chest') ? 'chest tightness' : 'reported physical symptom';
    severity = text.includes('severe') || text.includes('bad') ? 'severe' : 'moderate';
    if (patientContext?.condition?.toLowerCase().includes('cabg') || patientContext?.condition?.toLowerCase().includes('cardiac')) {
      severity = 'severe';
    }
  } else if (text.includes('fine') || text.includes('good') || text.includes('better')) {
    severity = 'none';
    mood = 'reassured';
  }

  if (text.includes('took my meds') || text.includes('taken my medication') || text.includes('took meds')) {
    medAdherence = 'yes';
  } else if (text.includes("didn't take") || text.includes('missed my meds') || text.includes('ran out of pills')) {
    medAdherence = 'no';
  }

  if (text.includes('anxious') || text.includes('worried') || text.includes('scared')) {
    mood = 'anxious';
  }

  return {
    symptom,
    severity,
    mood,
    medAdherence,
  };
}
