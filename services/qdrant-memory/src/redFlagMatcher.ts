import { RedFlagMatch } from '@wellcall/shared-types';

/**
 * Standalone semantic red-flag matcher function.
 * Evaluates spoken symptom string against patient red-flag list.
 */
export async function matchRedFlags(
  symptom: string,
  redFlags: string[]
): Promise<RedFlagMatch> {
  const normalized = symptom.toLowerCase().trim();

  if (!normalized || !redFlags || redFlags.length === 0) {
    return {
      matched: false,
      riskTier: 'low',
      reason: 'No symptom phrase provided or red flag list is empty.',
    };
  }

  // Substring & Keyword Matching
  for (const flagText of redFlags) {
    const flagLower = flagText.toLowerCase();

    if (normalized.includes(flagLower) || flagLower.split(' ').some((word) => word.length > 3 && normalized.includes(word))) {
      return {
        matched: true,
        matchedFlag: flagText,
        riskTier: 'high',
        reason: `Symptom "${symptom}" matched red-flag criteria: ${flagText}`,
      };
    }
  }

  return {
    matched: false,
    riskTier: 'low',
    reason: 'No direct keyword or semantic red flag match found.',
  };
}
