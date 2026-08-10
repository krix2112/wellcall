import assert from 'node:assert';
import { test } from 'node:test';
import { extractFields } from './claudeExtractor.js';

test('claudeExtractor - Test Case A: Post-CABG patient with chest tightness', async () => {
  const transcript = 'My chest feels tight when I try to take deep breaths';
  const context = { condition: 'Post-CABG' };
  const result = await extractFields(transcript, context);

  console.log('[Test Case A Output]:', JSON.stringify(result, null, 2));

  assert.ok(result.symptom !== null, 'Symptom should not be null');
  assert.ok(result.symptom.toLowerCase().includes('chest'), 'Extracted symptom should reference chest tightness');
  assert.ok(
    result.severity === 'severe' || result.severity === 'moderate',
    'Severity should be severe or moderate for cardiac chest tightness'
  );
});

test('claudeExtractor - Test Case B: Fine recovery with medication adherence', async () => {
  const transcript = "I'm feeling fine today, took my meds this morning";
  const result = await extractFields(transcript);

  console.log('[Test Case B Output]:', JSON.stringify(result, null, 2));

  assert.strictEqual(result.medAdherence, 'yes', 'medAdherence should be yes');
  assert.ok(result.severity === 'none' || result.severity === null, 'severity should be none or null');
  assert.strictEqual(result.symptom, null, 'symptom should be null when feeling fine');
});

test('claudeExtractor - Test Case C: Benign transcript without symptoms returns mostly nulls', async () => {
  const transcript = 'Just watching TV and resting on the couch right now.';
  const result = await extractFields(transcript);

  console.log('[Test Case C Output]:', JSON.stringify(result, null, 2));

  assert.strictEqual(result.symptom, null, 'Should not hallucinate symptoms');
  assert.strictEqual(result.medAdherence, null, 'medAdherence should be null when unmentioned');
});
