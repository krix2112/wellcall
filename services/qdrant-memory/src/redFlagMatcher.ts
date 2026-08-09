import { RedFlagDefinition, RedFlagMatch } from '@wellcall/shared-types';

/**
 * Standalone semantic red-flag matcher function.
 * Evaluates spoken symptom string against patient red-flag list.
 */
export async function matchRedFlags(
  symptom: string,
  redFlags: RedFlagDefinition[]
): Promise<RedFlagMatch> {
  const normalized = symptom.toLowerCase().trim();

  if (!normalized || redFlags.length === 0) {
    return {
      matched: false,
      riskTier: 'low',
      confidence: 1.0,
      explanation: 'No symptom phrase provided or red flag list is empty.',
    };
  }

  // Exact & Substring Keyword Matching
  for (const flag of redFlags) {
    const matchedPhrase = flag.exampleUtterances.find((phrase) =>
      normalized.includes(phrase.toLowerCase())
    );

    if (matchedPhrase || normalized.includes(flag.category.toLowerCase())) {
      return {
        matched: true,
        matchedFlag: flag.id,
        riskTier: flag.severity,
        confidence: 0.95,
        explanation: `Symptom "${symptom}" matched red-flag criteria: ${flag.description}`,
      };
    }
  }

  return {
    matched: false,
    riskTier: 'low',
    confidence: 0.5,
    explanation: 'No direct keyword or semantic red flag match found.',
  };
}
