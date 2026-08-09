import assert from 'node:assert';
import { test } from 'node:test';
import { matchRedFlags } from './redFlagMatcher';

const sampleRedFlags = [
  'Sudden chest tightness or severe pressure',
  'Fever above 101F or shaking chills',
];

test('redFlagMatcher - POSITIVE MATCH: detects cardiac chest tightness as high risk', async () => {
  const result = await matchRedFlags('My chest feels tight when breathing', sampleRedFlags);
  
  assert.strictEqual(result.matched, true);
  assert.strictEqual(result.riskTier, 'high');
});

test('redFlagMatcher - NEGATIVE MATCH: handles benign recovery phrase safely', async () => {
  const result = await matchRedFlags('I am feeling much better and taking my walks', sampleRedFlags);
  
  assert.strictEqual(result.matched, false);
  assert.strictEqual(result.riskTier, 'low');
});
