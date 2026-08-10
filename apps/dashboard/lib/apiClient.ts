import { Patient, CallSession, TranscriptEntry, Escalation, ServerToClientEvents } from '@wellcall/shared-types';
import { io, Socket } from 'socket.io-client';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3001';

// Expose a helper for the mic page to discover the configured gateway URL
export function getGatewayUrl(): string {
  return GATEWAY_URL;
}

// REST Fetch Helpers
export async function getPatients(): Promise<Patient[]> {
  try {
    const res = await fetch(`${GATEWAY_URL}/patients`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function getPatientById(id: string): Promise<Patient | null> {
  try {
    const res = await fetch(`${GATEWAY_URL}/patients/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export type EnrichedCallSession = CallSession & {
  outcome?: 'routine' | 'escalated';
  escalationReason?: string;
};

export async function getCallsForPatient(patientId: string): Promise<EnrichedCallSession[]> {
  try {
    const res = await fetch(`${GATEWAY_URL}/patients/${patientId}/calls`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function getCallById(id: string): Promise<{ call: CallSession; transcripts: TranscriptEntry[] } | null> {
  try {
    const res = await fetch(`${GATEWAY_URL}/calls/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getAudit(): Promise<{ escalations: Escalation[]; calls: CallSession[] }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/audit`);
    return await res.json();
  } catch {
    return { escalations: [], calls: [] };
  }
}

// Socket.io Singleton Connection
let socket: Socket<ServerToClientEvents> | null = null;

function getSocket(): Socket<ServerToClientEvents> {
  if (!socket) {
    socket = io(GATEWAY_URL, {
      autoConnect: true,
    });
  }
  return socket;
}

// Typed Subscribe Helpers
export function onTranscriptNew(callback: (entry: TranscriptEntry) => void): () => void {
  const s = getSocket();
  s.on('transcript:new', callback);
  return () => {
    s.off('transcript:new', callback);
  };
}

export function onEscalationNew(callback: (escalation: Escalation) => void): () => void {
  const s = getSocket();
  s.on('escalation:new', callback);
  return () => {
    s.off('escalation:new', callback);
  };
}

export function onCallStatus(
  callback: (payload: { callId: string; status: CallSession['status'] }) => void
): () => void {
  const s = getSocket();
  s.on('call:status', callback);
  return () => {
    s.off('call:status', callback);
  };
}
