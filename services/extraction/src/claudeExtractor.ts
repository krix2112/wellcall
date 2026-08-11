import OpenAI from 'openai';
import { ExtractedFields } from '@wellcall/shared-types';

export const DEFAULT_EXTRACTED_FIELDS: ExtractedFields = {
  symptom: null,
  severity: null,
  mood: null,
  medAdherence: null,
};

/**
 * Pure workspace package function: Extracts structured clinical fields from patient transcript.
 * Uses Groq API (OpenAI-SDK compatible) with llama-3.3-70b-versatile and function calling.
 * NO SERVER CODE / NO HTTP ENDPOINTS HERE.
 */
export async function extractFields(
  transcriptText: string,
  patientContext?: { condition: string }
): Promise<ExtractedFields> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    console.warn('[claudeExtractor/groq] GROQ_API_KEY is not set or using placeholder. Returning safe fallback.');
    return parseFallbackHeuristic(transcriptText, patientContext);
  }

  try {
    const openai = new OpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey,
    });

    const conditionHint = patientContext?.condition
      ? `Patient discharge condition context: "${patientContext.condition}". Use this medical condition to accurately evaluate ambiguous or subtle symptom expressions.`
      : 'No prior condition context provided.';

    const systemPrompt = `You are a multilingual clinical extraction parser for post-discharge patient follow-up calls in English and Hinglish (Hindi + English blend).
Extract structured clinical fields strictly from what is explicitly stated or clearly implied in the transcript snippet (whether spoken in English, Hindi, or Hinglish, e.g. "chest me dard hai" -> symptom: "chest pain", "saans lene me dikkat" -> symptom: "shortness of breath", "dawa nahi li" -> medAdherence: "no").
Rules:
1. Do NOT guess or hallucinate symptoms that are not mentioned. Return null if a field is omitted.
2. ${conditionHint}
3. Always translate extracted symptom descriptions into standard English terms for vector clinical risk matching.
4. Call the function "extract_patient_checkin_fields" with your structured extraction result.`;

    const response = await openai.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: transcriptText },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'extract_patient_checkin_fields',
            description:
              'Record structured symptoms, severity, mood, and medication adherence from patient check-in dialogue.',
            parameters: {
              type: 'object',
              properties: {
                symptom: {
                  type: ['string', 'null'],
                  description:
                    'The specific symptom or physical complaint described by the patient, or null if none mentioned.',
                },
                severity: {
                  type: ['string', 'null'],
                  enum: ['none', 'mild', 'moderate', 'severe', null],
                  description:
                    'Severity level of the symptom: none, mild, moderate, severe, or null if not mentioned.',
                },
                mood: {
                  type: ['string', 'null'],
                  description:
                    'Brief description of emotional state if expressed (e.g. anxious, reassured, frustrated), or null.',
                },
                medAdherence: {
                  type: ['string', 'null'],
                  enum: ['yes', 'no', 'unclear', null],
                  description:
                    'Medication adherence status: yes, no, unclear, or null if not mentioned.',
                },
              },
              required: ['symptom', 'severity', 'mood', 'medAdherence'],
            },
          },
        },
      ],
      tool_choice: {
        type: 'function',
        function: { name: 'extract_patient_checkin_fields' },
      },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (toolCall && toolCall.function?.arguments) {
      const extracted = JSON.parse(toolCall.function.arguments) as ExtractedFields;
      return {
        symptom: extracted.symptom ?? null,
        severity: extracted.severity ?? null,
        mood: extracted.mood ?? null,
        medAdherence: extracted.medAdherence ?? null,
      };
    }

    return DEFAULT_EXTRACTED_FIELDS;
  } catch (error) {
    console.error('[claudeExtractor/groq] API invocation error:', error);
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
