import { ExtractedFields, RedFlagMatch, RiskDecision } from '@wellcall/shared-types';

/**
 * Pure Deterministic Risk Decision Engine
 * Combines Claude symptom extraction outputs and Qdrant semantic vector red-flag matches
 * into a single defensible clinical action with a human-readable, spoken-appropriate reason.
 */
export function decideRisk(
  extracted: ExtractedFields,
  redFlagMatch: RedFlagMatch
): RiskDecision {
  // Rule A: High-Risk Red Flag Semantic Match
  if (redFlagMatch.matched && redFlagMatch.riskTier === 'high') {
    return {
      action: 'escalate',
      reason: `Patient's description matches a known high-risk pattern: "${redFlagMatch.matchedFlag || 'High Risk Red Flag'}"`,
    };
  }

  // Rule B: Severe Symptom Reported
  if (extracted.severity === 'severe') {
    const symptomName = extracted.symptom || 'unspecified symptom';
    return {
      action: 'escalate',
      reason: `Patient reported severe symptom severity: "${symptomName}"`,
    };
  }

  // Rule C: Medium-Risk Red Flag + Moderate Symptom Severity
  if (
    redFlagMatch.matched &&
    redFlagMatch.riskTier === 'medium' &&
    extracted.severity === 'moderate'
  ) {
    return {
      action: 'escalate',
      reason: `Patient matched a medium-risk red flag ("${redFlagMatch.matchedFlag}") while experiencing moderate symptom severity.`,
    };
  }

  // Rule D: Medication Non-Adherence with Active Symptoms
  if (
    extracted.medAdherence === 'no' &&
    extracted.severity !== null &&
    extracted.severity !== 'none'
  ) {
    return {
      action: 'escalate',
      reason: 'Patient reports skipping medication while experiencing symptoms',
    };
  }

  // Rule E: Routine Check-in (No Risk Indicators Detected)
  return {
    action: 'log',
    reason: 'Routine check-in, no risk indicators detected',
  };
}
