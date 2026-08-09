/**
 * services/audit-report/src/reportGenerator.test.ts
 *
 * Tests for generateAuditRecord and formatAuditRecordAsText.
 * Run with: node --test dist/reportGenerator.test.js
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  formatAuditRecordAsText,
  generateAuditRecord,
} from './reportGenerator.js';
import type {
  Escalation,
  ExtractedFields,
  Patient,
  RedFlagMatch,
  RiskDecision,
  TranscriptEntry,
} from '@wellcall/shared-types';

// ── Shared Fixtures ────────────────────────────────────────────────────────

const patient: Patient = {
  id: 'p-001',
  name: 'Margaret Chen',
  condition: 'Post-operative cardiac recovery (CABG)',
  medications: [
    { name: 'Metoprolol', dosage: '25mg', frequency: 'twice daily' },
    { name: 'Aspirin', dosage: '81mg', frequency: 'once daily' },
  ],
  followUpDate: '2026-08-20',
  redFlagSymptoms: [
    'Sudden chest tightness or heavy sternal pressure',
    'Shortness of breath at rest',
    'Wound drainage or incision redness',
    'Heart rate below 50 or above 120 bpm',
  ],
};

const transcript: TranscriptEntry[] = [
  {
    id: 't-1',
    callId: 'call-abc-001',
    speaker: 'system',
    text: "Good morning Margaret, this is your WellCall check-in. How are you feeling today?",
    timestamp: '2026-08-10T08:00:00.000Z',
  },
  {
    id: 't-2',
    callId: 'call-abc-001',
    speaker: 'patient',
    text: "I've been okay. A little tired but nothing too worrying. I took my pills this morning.",
    timestamp: '2026-08-10T08:00:22.000Z',
  },
  {
    id: 't-3',
    callId: 'call-abc-001',
    speaker: 'system',
    text: 'Glad to hear that. Any pain, tightness, or discomfort in your chest or incision area?',
    timestamp: '2026-08-10T08:00:40.000Z',
  },
  {
    id: 't-4',
    callId: 'call-abc-001',
    speaker: 'patient',
    text: 'No, the incision feels fine. Just general fatigue.',
    timestamp: '2026-08-10T08:01:00.000Z',
  },
];

const routineExtracted: ExtractedFields[] = [
  {
    symptom: 'fatigue',
    severity: 'mild',
    mood: 'okay',
    medAdherence: 'yes',
  },
];

const routineRedFlags: RedFlagMatch[] = [
  { matched: false, riskTier: 'low', reason: 'No red flag pattern detected.' },
];

const routineDecision: RiskDecision = {
  action: 'log',
  reason: 'Routine check-in, no risk indicators detected',
};

// ── Escalated call fixtures ────────────────────────────────────────────────

const escalatedTranscript: TranscriptEntry[] = [
  {
    id: 't-5',
    callId: 'call-abc-002',
    speaker: 'system',
    text: 'Good afternoon Margaret. How are you feeling since this morning?',
    timestamp: '2026-08-10T14:00:00.000Z',
  },
  {
    id: 't-6',
    callId: 'call-abc-002',
    speaker: 'patient',
    text: "My chest feels really tight when I try to take deep breaths. It started about an hour ago.",
    timestamp: '2026-08-10T14:00:18.000Z',
  },
  {
    id: 't-7',
    callId: 'call-abc-002',
    speaker: 'system',
    text: "I hear you — I'm going to flag this for your care team right away.",
    timestamp: '2026-08-10T14:00:35.000Z',
  },
];

const escalatedExtracted: ExtractedFields[] = [
  {
    symptom: 'chest tightness on deep breath',
    severity: 'moderate',
    mood: 'anxious',
    medAdherence: 'yes',
  },
];

const escalatedRedFlags: RedFlagMatch[] = [
  {
    matched: true,
    riskTier: 'high',
    matchedFlag: 'Sudden chest tightness or heavy sternal pressure',
    reason: "Patient's description matches a known high-risk pattern",
  },
];

const escalatedDecision: RiskDecision = {
  action: 'escalate',
  reason:
    'Patient\'s description matches a known high-risk pattern: "Sudden chest tightness or heavy sternal pressure"',
};

const escalation: Escalation = {
  id: 'esc-xyz-001',
  callId: 'call-abc-002',
  patientId: 'p-001',
  reason: escalatedDecision.reason,
  timestamp: '2026-08-10T14:00:36.000Z',
  acknowledged: false,
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe('auditReport - generateAuditRecord', () => {
  it('Test 1: routine call produces valid AuditRecord with no escalation field', () => {
    const record = generateAuditRecord({
      callId: 'call-abc-001',
      patient,
      transcript,
      extractedFields: routineExtracted,
      redFlagMatches: routineRedFlags,
      finalDecision: routineDecision,
    });

    assert.strictEqual(record.callId, 'call-abc-001');
    assert.strictEqual(record.patientId, 'p-001');
    assert.strictEqual(record.patientName, 'Margaret Chen');
    assert.strictEqual(
      record.patientCondition,
      'Post-operative cardiac recovery (CABG)'
    );
    assert.strictEqual(
      record.callTimestamp,
      '2026-08-10T08:00:00.000Z',
      'Timestamp should be the earliest transcript entry'
    );
    assert.strictEqual(record.transcript.length, 4);
    assert.strictEqual(record.extractedFields.length, 1);
    assert.strictEqual(record.redFlagMatches.length, 1);
    assert.strictEqual(record.finalDecision.action, 'log');
    assert.strictEqual(
      record.escalation,
      undefined,
      'No escalation should be present for routine call'
    );
  });

  it('Test 2: escalated call includes escalation field with correct values', () => {
    const record = generateAuditRecord({
      callId: 'call-abc-002',
      patient,
      transcript: escalatedTranscript,
      extractedFields: escalatedExtracted,
      redFlagMatches: escalatedRedFlags,
      finalDecision: escalatedDecision,
      escalation,
    });

    assert.strictEqual(record.callId, 'call-abc-002');
    assert.strictEqual(record.finalDecision.action, 'escalate');
    assert.ok(record.escalation, 'Escalation field must be present');
    assert.strictEqual(record.escalation!.id, 'esc-xyz-001');
    assert.strictEqual(record.escalation!.acknowledged, false);
    assert.strictEqual(
      record.escalation!.callId,
      'call-abc-002',
      'Escalation callId must match record callId'
    );
    assert.strictEqual(record.redFlagMatches[0].matched, true);
    assert.strictEqual(record.redFlagMatches[0].riskTier, 'high');
  });
});

describe('auditReport - formatAuditRecordAsText', () => {
  it('Test 3: formatAuditRecordAsText produces readable output for both cases', () => {
    const routineRecord = generateAuditRecord({
      callId: 'call-abc-001',
      patient,
      transcript,
      extractedFields: routineExtracted,
      redFlagMatches: routineRedFlags,
      finalDecision: routineDecision,
    });

    const escalatedRecord = generateAuditRecord({
      callId: 'call-abc-002',
      patient,
      transcript: escalatedTranscript,
      extractedFields: escalatedExtracted,
      redFlagMatches: escalatedRedFlags,
      finalDecision: escalatedDecision,
      escalation,
    });

    const routineText = formatAuditRecordAsText(routineRecord);
    const escalatedText = formatAuditRecordAsText(escalatedRecord);

    // Structural assertions
    assert.ok(
      routineText.includes('Margaret Chen'),
      'Patient name must appear'
    );
    assert.ok(
      routineText.includes('LOG ROUTINELY'),
      'Routine action label must appear'
    );
    assert.ok(
      routineText.includes('No red flags matched'),
      'No red flag message must appear'
    );
    assert.ok(
      !routineText.includes('ESCALATION RECORD'),
      'Escalation section must NOT appear in routine report'
    );

    assert.ok(
      escalatedText.includes('ESCALATE TO NURSE'),
      'Escalation action label must appear'
    );
    assert.ok(
      escalatedText.includes('ESCALATION RECORD'),
      'Escalation section must appear'
    );
    assert.ok(
      escalatedText.includes('Sudden chest tightness'),
      'Matched flag must appear in text'
    );
    assert.ok(
      escalatedText.includes('PENDING'),
      'Unacknowledged escalation must show PENDING'
    );

    // Print the actual text so the user can eyeball readability
    console.log('\n' + '='.repeat(68));
    console.log('ROUTINE CALL REPORT:');
    console.log('='.repeat(68));
    console.log(routineText);

    console.log('\n' + '='.repeat(68));
    console.log('ESCALATED CALL REPORT:');
    console.log('='.repeat(68));
    console.log(escalatedText);
  });
});
