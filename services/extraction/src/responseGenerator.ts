import OpenAI from 'openai';
import { ExtractedFields, RedFlagMatch, RiskDecision } from '@wellcall/shared-types';

/**
 * Generates WellCall's conversational response to a patient utterance.
 * Uses Groq (OpenAI-compatible) to produce a natural, context-aware response
 * that acknowledges the patient's reported symptom and provides appropriate
 * follow-up or escalation messaging.
 */
export async function generateWellCallResponse(
  patientUtterance: string,
  patientContext: { name?: string; condition?: string },
  extracted: ExtractedFields,
  redFlagMatch: RedFlagMatch,
  decision: RiskDecision
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    console.warn('[responseGenerator] GROQ_API_KEY not set — using fallback response logic.');
    return fallbackResponse(patientUtterance, extracted, redFlagMatch, decision, patientContext);
  }

  try {
    const openai = new OpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey,
    });

    const name = patientContext.name || 'there';
    const condition = patientContext.condition || 'your recovery';

    const prompt = `
You are WellCall, an AI voice assistant for post-discharge patient follow-up calls.
The patient is: ${name}, recovering from: ${condition}.
The patient just said: "${patientUtterance}"

Extracted fields:
- Symptom: ${extracted.symptom || 'none'}
- Severity: ${extracted.severity || 'none'}
- Mood: ${extracted.mood || 'none'}
- Medication adherence: ${extracted.medAdherence || 'none'}

Red flag analysis:
- Matched: ${redFlagMatch.matched}
- ${redFlagMatch.matched ? `Matched flag: ${redFlagMatch.matchedFlag}` : 'No red flags matched'}

Risk decision: ${decision.action.toUpperCase()}
- Reason: ${decision.reason}

Generate a single, natural spoken response for WellCall to say to the patient.
${decision.action === 'escalate'
      ? `CRITICAL: Acknowledge the symptom, tell the patient you are escalating to a nurse immediately. Be empathetic but direct.`
      : `Acknowledge what the patient shared. If they reported no symptoms, encourage them. If they reported mild symptoms, ask a follow-up question. If they mentioned medication adherence, respond appropriately. Keep it conversational and brief (1-2 sentences max).`
    }
Do NOT include any XML, JSON, SSML, or markup. Just plain text spoken words.`;

    const response = await openai.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      messages: [
        { role: 'system', content: 'You are WellCall, a post-discharge patient check-in AI assistant. You speak naturally and compassionately.' },
        { role: 'user', content: prompt },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (text && text.length > 0) {
      return text;
    }
    return fallbackResponse(patientUtterance, extracted, redFlagMatch, decision, patientContext);
  } catch (error) {
    console.error('[responseGenerator] Groq API error:', error instanceof Error ? error.message : error);
    return fallbackResponse(patientUtterance, extracted, redFlagMatch, decision, patientContext);
  }
}

/**
 * Fallback response when Groq is unavailable.
 * Generates a deterministic, context-aware response based on extracted fields.
 */
function fallbackResponse(
  patientUtterance: string,
  extracted: ExtractedFields,
  redFlagMatch: RedFlagMatch,
  decision: RiskDecision,
  patientContext: { name?: string; condition?: string }
): string {
  const name = patientContext.name || 'there';

  if (decision.action === 'escalate') {
    if (extracted.symptom) {
      return `I understand you're experiencing ${extracted.symptom}. I'm notifying your care team and escalating to a nurse immediately.`;
    }
    return `I'm going to connect you with a nurse right away about what you've described.`;
  }

  const text = patientUtterance.toLowerCase();

  if (text.includes('fine') || text.includes('good') || text.includes('better') || text.includes('alright')) {
    return `That's great to hear, ${name}! Keep up the good work with your recovery. Have a wonderful day.`;
  }

  if (extracted.symptom) {
    return `I've noted your ${extracted.symptom}. I'm logging this for your care team. Is there anything else you'd like to share about how you're feeling?`;
  }

  if (extracted.medAdherence === 'no') {
    return `I see you may have missed some medication. It's important to stay on schedule. Would you like me to remind you again later?`;
  }

  if (extracted.medAdherence === 'yes') {
    return `Good job staying on your medication. Is there anything else you'd like to discuss?`;
  }

  return `Thank you for sharing that, ${name}. I've recorded this in your check-in. Take care.`;
}
