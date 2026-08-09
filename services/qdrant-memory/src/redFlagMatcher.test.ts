import assert from 'node:assert';
import { test } from 'node:test';
import { matchRedFlags } from './redFlagMatcher';
import { RedFlagDefinition } from '@wellcall/shared-types';

const sampleRedFlags: RedFlagDefinition[] = [
  {
    id: 'rf-cardiac-01',
    category: 'cardiac',
    description: 'Sudden chest tightness or severe pressure',
    severity: 'critical',
    exampleUtterances: ['chest feels tight', 'heavy chest', 'chest pressure'],
  },
  {
    id: 'rf-fever-02',
    category: 'infection',
    description: 'Fever above 101F or shaking chills',
    severity: 'high',
    exampleUtterances: ['high fever', 'shaking chills'],
  },
];

test('redFlagMatcher - POSITIVE MATCH: detects cardiac chest tightness as critical risk', async () => {
  const result = await matchRedFlags('My chest feels tight when breathing', sampleRedFlags);
  
  assert.strictEqual(result.matched, true);
  assert.strictEqual(result.matchedFlag, 'rf-cardiac-01');
  assert.strictEqual(result.riskTier, 'critical');
  assert.ok(result.confidence > 0.9);
});

test('redFlagMatcher - NEGATIVE MATCH: handles benign recovery phrase safely', async () => {
  const result = await matchRedFlags('I am feeling much better and taking my walks', sampleRedFlags);
  
  assert.strictEqual(result.matched, false);
  assert.strictEqual(result.riskTier, 'low');
});
