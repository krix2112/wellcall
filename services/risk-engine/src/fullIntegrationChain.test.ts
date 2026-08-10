import assert from 'node:assert';
import { test } from 'node:test';
import { extractFields } from '../../extraction/dist/index.js';
import { matchRedFlag, seedPatientCarePlan } from '../../qdrant-memory/dist/index.js';
import { decideRisk } from './riskDecision.js';
import { Patient } from '@wellcall/shared-types';

test('Full Integration Chain Test: Groq extraction -> Qdrant vector match -> Risk decision', async () => {
  const transcriptText = 'My chest feels tight when I try to take deep breaths';
  const patientContext = { condition: 'Post-CABG' };
  const patientId = 'patient-01';

  // Seed patient-01 red flags in vector store
  const patient01: Patient = {
    id: patientId,
    name: 'Jane Smith (Demo)',
    condition: 'Post-Coronary Artery Bypass Graft (CABG)',
    followUpDate: '2026-08-15',
    medications: [
      { name: 'Aspirin', dosage: '81mg', frequency: 'Once daily' },
      { name: 'Atorvastatin', dosage: '40mg', frequency: 'At bedtime' },
    ],
    redFlagSymptoms: [
      'Sudden chest tightness or heavy sternal pressure',
      'Shortness of breath while resting',
      'Rapid weight gain over 3 lbs in 24 hours',
    ],
  };

  await seedPatientCarePlan(patient01);

  console.log('\n====================================================================');
  console.log('STEP 1: Groq LLM Field Extraction');
  console.log('====================================================================');
  console.log(`Transcript Input : "${transcriptText}"`);
  console.log(`Patient Context  : ${patientContext.condition}`);

  // 1. Groq Field Extraction
  const extracted = await extractFields(transcriptText, patientContext);
  console.log('Extracted Fields Output:', JSON.stringify(extracted, null, 2));

  console.log('\n====================================================================');
  console.log('STEP 2: Qdrant Vector Semantic Red-Flag Match');
  console.log('====================================================================');

  // 2. Qdrant Vector Match
  const redFlagMatch = await matchRedFlag(patientId, transcriptText);
  console.log('Red Flag Match Output:', JSON.stringify(redFlagMatch, null, 2));

  console.log('\n====================================================================');
  console.log('STEP 3: Risk Engine Deterministic Decision');
  console.log('====================================================================');

  // 3. Risk Engine Decision
  const finalDecision = decideRisk(extracted, redFlagMatch);
  console.log('Final Decision Output:', JSON.stringify(finalDecision, null, 2));

  console.log('\n====================================================================');
  console.log('ANALYSIS & VERIFICATION SUMMARY');
  console.log('====================================================================');
  console.log(`• Groq Extracted Severity: "${extracted.severity}" (Groq rated moderate vs Claude severe)`);
  console.log(`• Qdrant Matched Flag    : "${redFlagMatch.matchedFlag}"`);
  console.log(`• Final Action           : "${finalDecision.action.toUpperCase()}"`);
  console.log(`• Decision Rationale     : ${finalDecision.reason}`);
  console.log('====================================================================\n');

  // Assertions
  assert.strictEqual(finalDecision.action, 'escalate', 'Final action MUST be escalate');
  assert.strictEqual(redFlagMatch.matched, true, 'Qdrant vector search MUST match red flag');
  assert.strictEqual(redFlagMatch.riskTier, 'high', 'Risk tier MUST be high');
  assert.ok(
    finalDecision.reason.includes('matches a known high-risk pattern'),
    'Rule A must fire due to High-Risk Qdrant Vector match'
  );
});
