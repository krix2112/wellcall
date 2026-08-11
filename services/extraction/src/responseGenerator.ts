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
  patientContext: { name?: string; condition?: string; languagePreference?: 'english' | 'hindi' | 'auto' },
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
    const lang = patientContext.languagePreference || 'auto';

    let languageInstruction = '';
    if (lang === 'english') {
      languageInstruction = `CRITICAL LANGUAGE INSTRUCTION: The patient has chosen ENGLISH. Respond 100% in natural, empathetic, warm English. Do NOT use any Hindi words or Hinglish phrases at all.`;
    } else if (lang === 'hindi') {
      languageInstruction = `CRITICAL LANGUAGE INSTRUCTION: The patient has chosen HINDI. Respond 100% in smooth, polite, caring Hindi/Hinglish written in standard Latin alphabet (e.g. "Aap kaisa feel kar rahe hain? Kripya mujhe batayein."). Keep it smooth and clear.`;
    } else {
      languageInstruction = `CRITICAL LANGUAGE INSTRUCTION: Detect the language from the patient's utterance. If they spoke or requested English, respond 100% in English. If they spoke Hindi/Hinglish, respond in smooth Hindi/Hinglish (Latin alphabet).`;
    }

    const prompt = `
You are Sara, an AI voice assistant for post-discharge patient follow-up calls.
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

${languageInstruction}

${decision.action === 'escalate'
      ? `CRITICAL: Acknowledge the symptom in the chosen language, tell the patient you are escalating to a nurse immediately. Be empathetic but direct.`
      : `Acknowledge what the patient shared in the chosen language. If they reported no symptoms, encourage them. If they reported mild symptoms, ask a brief follow-up. Keep it conversational and brief (1-2 short sentences max).`
    }
Do NOT include any XML, JSON, SSML, or Devanagari script. Only plain text spoken words in standard Latin script.`;

    const response = await openai.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      messages: [
        { role: 'system', content: 'You are Sara, a compassionate post-discharge patient care assistant. You dynamically adapt to the patient\'s language preference (English vs Hindi/Hinglish).' },
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
 * Generates a deterministic, context-aware response based on extracted fields and language preference.
 */
function fallbackResponse(
  patientUtterance: string,
  extracted: ExtractedFields,
  redFlagMatch: RedFlagMatch,
  decision: RiskDecision,
  patientContext: { name?: string; condition?: string; languagePreference?: 'english' | 'hindi' | 'auto' }
): string {
  const name = patientContext.name || 'there';
  const lang = patientContext.languagePreference || 'auto';
  const text = patientUtterance.toLowerCase();

  const isEnglish = lang === 'english' || text.includes('english') || text.includes('speak in english');

  if (isEnglish) {
    if (decision.action === 'escalate') {
      if (extracted.symptom) {
        return `I understand you're experiencing ${extracted.symptom}. I am notifying your care team and escalating to a nurse immediately.`;
      }
      return `I am going to connect you with a nurse right away about what you've described. Please hold on.`;
    }
    if (text.includes('fine') || text.includes('good') || text.includes('better') || text.includes('alright')) {
      return `Glad to hear that, ${name}! Are you taking your prescribed medications as scheduled?`;
    }
    return `Thank you for sharing that. I've recorded this in your check-in. Please rest well!`;
  }

  // Hindi / Hinglish Fallback
  if (decision.action === 'escalate') {
    if (extracted.symptom) {
      return `Mujhe samajh aa raha hai ki aapko ${extracted.symptom} ho raha hai. Main abhi doctor aur nurse ko notify kar raha hoon.`;
    }
    return `Main abhi aapki baat nurse se connect karwa raha hoon. Kripya hold kijiye.`;
  }

  if (text.includes('fine') || text.includes('good') || text.includes('better') || text.includes('alright') || text.includes('theek')) {
    return `Yeh sunkar achha laga! Kya aapne aaj ki saari medicines time par li hain?`;
  }

  if (extracted.symptom) {
    return `Main aapke ${extracted.symptom} ki details record kar raha hoon. Kya koi aur dikkat bhi lag rahi hai?`;
  }

  return `Shukriya batane ke liye. Kripya apna khayal rakhein aur koi dikkat ho toh turant batayein.`;
}
