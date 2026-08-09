import assert from 'node:assert';
import { test } from 'node:test';
import { decideRisk } from './riskDecision';
import { ExtractedFields, RedFlagMatch } from '@wellcall/shared-types';

test('riskEngine - Rule A: High-risk red flag match triggers immediate escalation', () => {
  const extracted: ExtractedFields = {
    symptom: 'chest pain',
    severity: 'moderate',
    mood: 'anxious',
    medAdherence: 'yes',
  };

  const redFlagMatch: RedFlagMatch = {
    matched: true,
    riskTier: 'high',
    matchedFlag: 'Sudden chest tightness or heavy sternal pressure',
    reason: 'Matched high-risk cardiac red flag',
  };

  const decision = decideRisk(extracted, redFlagMatch);

  console.log('[Test Rule A Reason]:', decision.reason);
  assert.strictEqual(decision.action, 'escalate');
  assert.ok(decision.reason.includes('known high-risk pattern'));
  assert.ok(decision.reason.includes('Sudden chest tightness'));
});

test('riskEngine - Rule B: Severe symptom severity triggers escalation regardless of red flag match', () => {
  const extracted: ExtractedFields = {
    symptom: 'unbearable incision pain',
    severity: 'severe',
    mood: 'distressed',
    medAdherence: 'yes',
  };

  const redFlagMatch: RedFlagMatch = {
    matched: false,
    riskTier: 'low',
  };

  const decision = decideRisk(extracted, redFlagMatch);

  console.log('[Test Rule B Reason]:', decision.reason);
  assert.strictEqual(decision.action, 'escalate');
  assert.ok(decision.reason.includes('severe symptom severity'));
  assert.ok(decision.reason.includes('unbearable incision pain'));
});

test('riskEngine - Rule C: Medium-risk red flag match + moderate severity triggers escalation', () => {
  const extracted: ExtractedFields = {
    symptom: 'moderate wound redness',
    severity: 'moderate',
    mood: 'concerned',
    medAdherence: 'yes',
  };

  const redFlagMatch: RedFlagMatch = {
    matched: true,
    riskTier: 'medium',
    matchedFlag: 'Wound drainage or incision redness',
    reason: 'Matched medium-risk surgical site flag',
  };

  const decision = decideRisk(extracted, redFlagMatch);

  console.log('[Test Rule C Reason]:', decision.reason);
  assert.strictEqual(decision.action, 'escalate');
  assert.ok(decision.reason.includes('medium-risk red flag'));
  assert.ok(decision.reason.includes('moderate symptom severity'));
});

test('riskEngine - Rule D: Medication non-adherence combined with active symptoms triggers escalation', () => {
  const extracted: ExtractedFields = {
    symptom: 'mild nausea',
    severity: 'mild',
    mood: 'frustrated',
    medAdherence: 'no',
  };

  const redFlagMatch: RedFlagMatch = {
    matched: false,
    riskTier: 'low',
  };

  const decision = decideRisk(extracted, redFlagMatch);

  console.log('[Test Rule D Reason]:', decision.reason);
  assert.strictEqual(decision.action, 'escalate');
  assert.strictEqual(
    decision.reason,
    'Patient reports skipping medication while experiencing symptoms'
  );
});

test('riskEngine - Rule E: Routine check-in with no risk indicators logs routinely', () => {
  const extracted: ExtractedFields = {
    symptom: null,
    severity: 'none',
    mood: 'reassured',
    medAdherence: 'yes',
  };

  const redFlagMatch: RedFlagMatch = {
    matched: false,
    riskTier: 'low',
  };

  const decision = decideRisk(extracted, redFlagMatch);

  console.log('[Test Rule E Reason]:', decision.reason);
  assert.strictEqual(decision.action, 'log');
  assert.strictEqual(decision.reason, 'Routine check-in, no risk indicators detected');
});

test('riskEngine - Ambiguous Case: Mild symptom with no red flag match correctly logs routinely', () => {
  const extracted: ExtractedFields = {
    symptom: 'mild fatigue',
    severity: 'mild',
    mood: null,
    medAdherence: 'yes',
  };

  const redFlagMatch: RedFlagMatch = {
    matched: false,
    riskTier: 'low',
  };

  const decision = decideRisk(extracted, redFlagMatch);

  console.log('[Test Ambiguous Case Reason]:', decision.reason);
  assert.strictEqual(decision.action, 'log', 'Mild fatigue with good med adherence should NOT trigger false escalation');
  assert.strictEqual(decision.reason, 'Routine check-in, no risk indicators detected');
});
