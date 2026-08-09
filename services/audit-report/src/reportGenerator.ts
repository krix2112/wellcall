import { Patient, RiskDecision, TranscriptEntry, ExtractedFields } from '@wellcall/shared-types';

export interface AuditReportData {
  callId: string;
  patient: Patient;
  transcripts: TranscriptEntry[];
  extractions: ExtractedFields[];
  decision: RiskDecision;
}

export interface GeneratedAuditReport {
  auditId: string;
  timestamp: string;
  summaryText: string;
  jsonExport: Record<string, unknown>;
}

/**
 * Pure function: Compiles call history, extractions, and risk decision into structured JSON export.
 * NO SERVER CODE HERE.
 */
export async function generateAuditReport(data: AuditReportData): Promise<GeneratedAuditReport> {
  const auditId = `audit-${data.callId}-${Date.now()}`;
  const timestamp = new Date().toISOString();

  const summaryText = [
    `WELLCALL AUDIT RECORD: ${data.patient.name} (${data.patient.id})`,
    `Call ID: ${data.callId} | Date: ${timestamp}`,
    `Action: ${data.decision.action.toUpperCase()} [Risk: ${data.decision.riskTier.toUpperCase()}]`,
    `Reason: ${data.decision.reason}`,
  ].join('\n');

  return {
    auditId,
    timestamp,
    summaryText,
    jsonExport: {
      auditId,
      callId: data.callId,
      patientId: data.patient.id,
      timestamp,
      decision: data.decision,
      extractions: data.extractions,
      transcriptCount: data.transcripts.length,
    },
  };
}
