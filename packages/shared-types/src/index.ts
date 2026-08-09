/**
 * @wellcall/shared-types
 * Primary API Contract for Wellcall Monorepo
 * Shared across Fastify/Socket.io gateway, orchestrator, logic packages, and Next.js dashboard.
 */

// ==========================================
// 1. Patient & Care Plan Schemas
// ==========================================

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  purpose: string;
}

export interface RedFlagDefinition {
  id: string;
  category: string;
  description: string;
  severity: RiskTier;
  exampleUtterances: string[];
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface Patient {
  id: string;
  name: string;
  condition: string;
  dischargeDate: string;
  followUpDate: string;
  medications: Medication[];
  redFlags: RedFlagDefinition[];
  emergencyContacts: EmergencyContact[];
  specialInstructions?: string[];
}

// ==========================================
// 2. Call Session & Telephony Types
// ==========================================

export type CallStatus = 'idle' | 'ringing' | 'connected' | 'ended';

export interface CallSession {
  id: string;
  patientId: string;
  status: CallStatus;
  startTime: string;
  endTime?: string;
  durationSeconds?: number;
}

export interface TranscriptEntry {
  id: string;
  callId: string;
  patientId: string;
  timestamp: string;
  speaker: 'agent' | 'patient';
  text: string;
  isFinal: boolean;
}

// ==========================================
// 3. Clinical Intelligence Schemas
// ==========================================

export type RiskTier = 'low' | 'moderate' | 'high' | 'critical';

export type SymptomSeverity = 'mild' | 'moderate' | 'severe';

export interface ExtractedFields {
  symptom: string;
  severity: SymptomSeverity;
  mood: string;
  med_adherence: boolean;
  notes?: string;
}

export interface RedFlagMatch {
  matched: boolean;
  matchedFlag?: string;
  riskTier: RiskTier;
  confidence: number;
  explanation: string;
}

export interface RiskDecision {
  action: 'routine_log' | 'escalate';
  riskTier: RiskTier;
  reason: string;
  timestamp: string;
}

export interface Escalation {
  id: string;
  callId: string;
  patientId: string;
  patientName: string;
  timestamp: string;
  riskTier: RiskTier;
  reason: string;
  status: 'pending' | 'acknowledged' | 'resolved';
}

// ==========================================
// 4. Gateway Socket.io Event Contract
// ==========================================

export interface ServerToClientEvents {
  'transcript:new': (entry: TranscriptEntry) => void;
  'escalation:new': (escalation: Escalation) => void;
  'call:status': (payload: { callId: string; status: CallStatus }) => void;
}

export interface ClientToServerEvents {
  'call:start': (payload: { patientId: string }) => void;
  'call:hangup': (payload: { callId: string }) => void;
}
