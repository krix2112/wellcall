import { ExtractedFields, RedFlagMatch, RiskDecision } from '@wellcall/shared-types';

export interface DecideRiskInput {
  extraction: ExtractedFields;
  redFlagMatch: RedFlagMatch;
}

/**
 * Pure function: Combines extracted patient symptom data and red-flag semantic match
 * to determine routine log vs immediate nurse escalation with rationale.
 * NO SERVER CODE HERE.
 */
export async function decideRisk(input: DecideRiskInput): Promise<RiskDecision> {
  const timestamp = new Date().toISOString();
  const { extraction, redFlagMatch } = input;

  if (redFlagMatch.matched && (redFlagMatch.riskTier === 'high' || redFlagMatch.riskTier === 'critical')) {
    return {
      action: 'escalate',
      riskTier: redFlagMatch.riskTier,
      reason: `Patient reported symptom "${extraction.symptom}" matching red flag: ${redFlagMatch.explanation}`,
      timestamp,
    };
  }

  if (!extraction.med_adherence && extraction.severity === 'severe') {
    return {
      action: 'escalate',
      riskTier: 'high',
      reason: 'Patient reported severe symptoms alongside medication non-adherence.',
      timestamp,
    };
  }

  return {
    action: 'routine_log',
    riskTier: redFlagMatch.riskTier || 'low',
    reason: 'Routine post-discharge recovery check-in recorded. No high-risk red flags triggered.',
    timestamp,
  };
}
