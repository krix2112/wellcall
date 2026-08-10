import assert from 'node:assert';
import { test } from 'node:test';
import { bootstrap, runDemoSequence } from './index';

test('Fallback Demo Mode - End-to-End Test (Routine vs Escalation Scenarios)', async () => {
  // Bootstrap gateway server & socket manager
  await bootstrap();

  console.log('\n====================================================================');
  console.log('TESTING SCENARIO 1: ROUTINE CHECK-IN (Patient patient-02 / Jane Smith)');
  console.log('====================================================================');

  const routineResult = await runDemoSequence('patient-02', 'routine');
  console.log('[Routine Scenario Result]:', routineResult);

  assert.strictEqual(routineResult.finalAction, 'log', 'Routine scenario MUST log without escalating');

  console.log('\n====================================================================');
  console.log('TESTING SCENARIO 2: HIGH-RISK ESCALATION (Patient patient-01 / John Doe)');
  console.log('====================================================================');

  const escalationResult = await runDemoSequence('patient-01', 'escalation');
  console.log('[Escalation Scenario Result]:', escalationResult);

  assert.strictEqual(escalationResult.finalAction, 'escalate', 'Escalation scenario MUST escalate');
});
