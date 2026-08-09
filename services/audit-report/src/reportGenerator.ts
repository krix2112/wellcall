/**
 * services/audit-report/src/reportGenerator.ts
 *
 * Pure functions: no async, no API calls.
 * generateAuditRecord  — assembles a typed AuditRecord from raw call data.
 * formatAuditRecordAsText — produces a clean plain-text summary suitable for
 *   non-technical readers (nurses, compliance reviewers, legal).
 */

import type {
  AuditRecord,
  Escalation,
  ExtractedFields,
  Patient,
  RedFlagMatch,
  RiskDecision,
  TranscriptEntry,
} from '@wellcall/shared-types';

// ---------------------------------------------------------------------------
// generateAuditRecord
// ---------------------------------------------------------------------------

export interface GenerateAuditRecordInput {
  callId: string;
  patient: Patient;
  transcript: TranscriptEntry[];
  extractedFields: ExtractedFields[];
  redFlagMatches: RedFlagMatch[];
  finalDecision: RiskDecision;
  escalation?: Escalation;
}

export function generateAuditRecord(
  input: GenerateAuditRecordInput
): AuditRecord {
  const {
    callId,
    patient,
    transcript,
    extractedFields,
    redFlagMatches,
    finalDecision,
    escalation,
  } = input;

  // Derive call timestamp from the earliest transcript entry, or now.
  const callTimestamp =
    transcript.length > 0
      ? transcript.reduce((earliest, e) =>
          e.timestamp < earliest.timestamp ? e : earliest
        ).timestamp
      : new Date().toISOString();

  const record: AuditRecord = {
    callId,
    patientId: patient.id,
    patientName: patient.name,
    patientCondition: patient.condition,
    callTimestamp,
    transcript,
    extractedFields,
    redFlagMatches,
    finalDecision,
  };

  // Only attach escalation if it was actually triggered.
  if (escalation !== undefined) {
    record.escalation = escalation;
  }

  return record;
}

// ---------------------------------------------------------------------------
// formatAuditRecordAsText
// ---------------------------------------------------------------------------

/** Right-pad a label so values align in a two-column layout. */
function field(label: string, value: string, labelWidth = 22): string {
  return `${label.padEnd(labelWidth, ' ')}${value}`;
}

function divider(char = '─', width = 68): string {
  return char.repeat(width);
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

function formatExtractedFields(fields: ExtractedFields[]): string {
  if (fields.length === 0) return '  (none recorded)';
  return fields
    .map((f, i) => {
      const lines: string[] = [`  [Utterance ${i + 1}]`];
      if (f.symptom) lines.push(`    Symptom        : ${f.symptom}`);
      if (f.severity) lines.push(`    Severity       : ${f.severity}`);
      if (f.mood) lines.push(`    Mood           : ${f.mood}`);
      if (f.medAdherence)
        lines.push(`    Med Adherence  : ${f.medAdherence}`);
      return lines.join('\n');
    })
    .join('\n');
}

function formatRedFlagMatches(matches: RedFlagMatch[]): string {
  const hits = matches.filter((m) => m.matched);
  if (hits.length === 0) return '  No red flags matched during this call.';
  return hits
    .map((m, i) => {
      const lines = [`  [Match ${i + 1}] Risk Tier: ${m.riskTier.toUpperCase()}`];
      if (m.matchedFlag) lines.push(`    Matched Flag   : "${m.matchedFlag}"`);
      if (m.reason) lines.push(`    Reason         : ${m.reason}`);
      return lines.join('\n');
    })
    .join('\n');
}

function formatTranscript(entries: TranscriptEntry[]): string {
  if (entries.length === 0) return '  (no transcript recorded)';
  return entries
    .map((e) => {
      const speaker = e.speaker === 'patient' ? 'Patient  ' : 'WellCall ';
      const time = e.timestamp.slice(11, 19); // HH:MM:SS
      return `  [${time}] ${speaker}: "${e.text}"`;
    })
    .join('\n');
}

export function formatAuditRecordAsText(record: AuditRecord): string {
  const lines: string[] = [];

  lines.push(divider('═'));
  lines.push('  WELLCALL — CALL AUDIT REPORT');
  lines.push(divider('═'));
  lines.push('');

  // ── Patient & Call Info ────────────────────────────────────────────────
  lines.push('PATIENT & CALL INFORMATION');
  lines.push(divider());
  lines.push(field('Patient Name:', record.patientName));
  lines.push(field('Patient ID:', record.patientId));
  lines.push(field('Condition:', record.patientCondition));
  lines.push(field('Call ID:', record.callId));
  lines.push(field('Call Date/Time:', formatTimestamp(record.callTimestamp)));
  lines.push('');

  // ── Transcript ─────────────────────────────────────────────────────────
  lines.push('TRANSCRIPT');
  lines.push(divider());
  lines.push(formatTranscript(record.transcript));
  lines.push('');

  // ── Extracted Clinical Fields ──────────────────────────────────────────
  lines.push('EXTRACTED CLINICAL FIELDS');
  lines.push(divider());
  lines.push(formatExtractedFields(record.extractedFields));
  lines.push('');

  // ── Red Flag Matches ───────────────────────────────────────────────────
  lines.push('RED FLAG ANALYSIS');
  lines.push(divider());
  lines.push(formatRedFlagMatches(record.redFlagMatches));
  lines.push('');

  // ── Final Decision ─────────────────────────────────────────────────────
  lines.push('FINAL RISK DECISION');
  lines.push(divider());
  const actionLabel =
    record.finalDecision.action === 'escalate'
      ? '⚠  ESCALATE TO NURSE'
      : '✓  LOG ROUTINELY';
  lines.push(`  Action   : ${actionLabel}`);
  lines.push(`  Rationale: ${record.finalDecision.reason}`);
  lines.push('');

  // ── Escalation Detail (if any) ─────────────────────────────────────────
  if (record.escalation) {
    lines.push('ESCALATION RECORD');
    lines.push(divider());
    lines.push(field('  Escalation ID:', record.escalation.id));
    lines.push(
      field('  Escalated At:', formatTimestamp(record.escalation.timestamp))
    );
    lines.push(field('  Reason:', record.escalation.reason));
    lines.push(
      field(
        '  Acknowledged:',
        record.escalation.acknowledged ? 'Yes' : 'No — PENDING'
      )
    );
    lines.push('');
  }

  lines.push(divider('═'));
  lines.push(
    `  Report generated at: ${formatTimestamp(new Date().toISOString())}`
  );
  lines.push(divider('═'));

  return lines.join('\n');
}
