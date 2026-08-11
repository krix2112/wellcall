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
You are WellCall, an AI voice assistant for post-discharge patient follow-up calls in India/global.
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

CRITICAL INSTRUCTION:
Generate a single, natural spoken response in natural **Hinglish** (a warm blend of Hindi and English written in Latin alphabet, e.g. "Aap kaisa feel kar rahe hain?").
${decision.action === 'escalate'
      ? `CRITICAL: Acknowledge the symptom in Hinglish, tell the patient you are escalating to a nurse immediately (e.g. "Main abhi nurse ko alert kar raha hoon."). Be empathetic but direct.`
      : `Acknowledge what the patient shared in warm Hinglish. If they reported no symptoms, encourage them. If they reported mild symptoms, ask a brief follow-up. Keep it conversational and brief (1-2 short sentences max).`
    }
Do NOT include any XML, JSON, SSML, or Hindi script. Only plain text Hinglish in Latin script.`;

    const response = await openai.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.4,
      messages: [
        { role: 'system', content: 'You are WellCall, a compassionate post-discharge patient check-in AI assistant. You ALWAYS speak in natural, empathetic Hinglish (Romanized Hindi + English blend).' },
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
 * Generates a deterministic, context-aware Hinglish response based on extracted fields.
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
      return `Mujhe samajh aa raha hai ki aapko ${extracted.symptom} ho raha hai. Main abhi doctor aur nurse ko notify kar raha hoon.`;
    }
    return `Main abhi aapki baat nurse se connect karwa raha hoon. Kripya hold kijiye.`;
  }

  const text = patientUtterance.toLowerCase();

  if (text.includes('fine') || text.includes('good') || text.includes('better') || text.includes('alright') || text.includes('theek')) {
    return `Yeh sunkar achha laga! Kya aapne aaj ki saari medicines time par li hain?`;
  }

  if (extracted.symptom) {
    return `Main aapke ${extracted.symptom} ki details record kar raha hoon. Kya koi aur dikkat bhi lag rahi hai?`;
  }

  return `Shukriya batane ke liye. Kripya apna khayal rakhein aur koi dikkat ho toh turant batayein.`;
}
