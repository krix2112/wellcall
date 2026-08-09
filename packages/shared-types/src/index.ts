export interface CallSession {
  id: string;
  patientId: string;
  status: 'idle' | 'ringing' | 'connected' | 'ended';
  startedAt: string; // ISO date string
  endedAt: string | null; // ISO date string or null
}

export interface TranscriptEntry {
  id: string;
  callId: string;
  speaker: 'agent' | 'patient';
  text: string;
  timestamp: string; // ISO date string
}

export interface ExtractedFields {
  symptom: string | null;
  severity: 'none' | 'mild' | 'moderate' | 'severe';
  mood: string | null;
  medAdherence: boolean | null;
}
