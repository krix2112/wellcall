import assert from 'node:assert';
import { test } from 'node:test';
import { parseFallbackHeuristic } from './claudeExtractor';

test('claudeExtractor - Test Case A: Post-CABG patient with chest tightness', () => {
  const transcript = 'My chest feels tight when I try to take deep breaths';
  const context = { condition: 'Post-CABG' };
  const result = parseFallbackHeuristic(transcript, context);

  assert.ok(result.symptom !== null, 'Symptom should not be null');
  assert.ok(result.symptom.includes('chest'), 'Extracted symptom should reference chest tightness');
  assert.strictEqual(result.severity, 'severe', 'Severity should be severe for cardiac chest tightness context');
});

test('claudeExtractor - Test Case B: Fine recovery with medication adherence', () => {
  const transcript = "I'm feeling fine today, took my meds this morning";
  const result = parseFallbackHeuristic(transcript);

  assert.strictEqual(result.medAdherence, 'yes', 'medAdherence should be yes');
  assert.strictEqual(result.severity, 'none', 'severity should be none');
  assert.strictEqual(result.symptom, null, 'symptom should be null when feeling fine');
});

test('claudeExtractor - Test Case C: Benign transcript without symptoms returns mostly nulls', () => {
  const transcript = 'Just watching TV and resting on the couch right now.';
  const result = parseFallbackHeuristic(transcript);

  assert.strictEqual(result.symptom, null, 'Should not hallucinate symptoms');
  assert.strictEqual(result.severity, null, 'Severity should be null when no symptom is mentioned');
  assert.strictEqual(result.medAdherence, null, 'medAdherence should be null when unmentioned');
});
