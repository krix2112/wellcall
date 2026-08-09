/**
 * @wellcall/shared-types
 * Core TypeScript Interfaces for Wellcall Monorepo
 */

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  purpose?: string;
}

export interface Patient {
  id: string;
  name: string;
  condition: string;
  medications: Medication[];
  followUpDate: string;
  redFlagSymptoms: string[];
}

export type CallStatus = 'idle' | 'ringing' | 'connected' | 'ended';

export interface CallSession {
  id: string;
  patientId: string;
  status: CallStatus;
  startedAt: string;
  endedAt?: string;
}

export interface TranscriptEntry {
  id: string;
  callId: string;
  speaker: 'patient' | 'system';
  text: string;
  timestamp: string;
}

export interface ExtractedFields {
  symptom: string | null;
  severity: 'none' | 'mild' | 'moderate' | 'severe' | null;
  mood: string | null;
  medAdherence: 'yes' | 'no' | 'unclear' | null;
}

export interface RedFlagMatch {
  matched: boolean;
  riskTier: 'low' | 'medium' | 'high';
  matchedFlag?: string;
  reason?: string;
}

export interface RiskDecision {
  action: 'log' | 'escalate';
  reason: string;
}

export interface Escalation {
  id: string;
  callId: string;
  patientId: string;
  reason: string;
  timestamp: string;
  acknowledged: boolean;
}

export interface MemoryEntry {
  id: string;
  patientId: string;
  callId: string;
  summaryText: string;
  category: 'symptom' | 'mood' | 'med_adherence' | 'general';
  createdAt: string;
  correctedAt?: string;
  deleted?: boolean;
}

// Socket Event Payload References
export interface ServerToClientEvents {
  'transcript:new': (entry: TranscriptEntry) => void;
  'escalation:new': (escalation: Escalation) => void;
  'call:status': (payload: { callId: string; status: CallStatus }) => void;
}

export interface ClientToServerEvents {
  'call:start': (payload: { patientId: string }) => void;
  'call:hangup': (payload: { callId: string }) => void;
}
