import { Patient, CallSession, TranscriptEntry, Escalation, ServerToClientEvents } from '@wellcall/shared-types';
import { io, Socket } from 'socket.io-client';

export class GatewayApiClient {
  private baseUrl: string;
  private socket: Socket<ServerToClientEvents> | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3001';
  }

  // REST API Client Wrappers
  public async getPatients(): Promise<Patient[]> {
    try {
      const res = await fetch(`${this.baseUrl}/patients`);
      const json = await res.json();
      return json.data || [];
    } catch {
      return [];
    }
  }

  public async getPatientById(id: string): Promise<Patient | null> {
    try {
      const res = await fetch(`${this.baseUrl}/patients/${id}`);
      const json = await res.json();
      return json.data || null;
    } catch {
      return null;
    }
  }

  public async getCallById(id: string): Promise<{ call: CallSession; transcripts: TranscriptEntry[] } | null> {
    try {
      const res = await fetch(`${this.baseUrl}/calls/${id}`);
      const json = await res.json();
      return json.data || null;
    } catch {
      return null;
    }
  }

  public async getAuditEscalations(): Promise<Escalation[]> {
    try {
      const res = await fetch(`${this.baseUrl}/audit`);
      const json = await res.json();
      return json.data || [];
    } catch {
      return [];
    }
  }

  // Typed Socket.io Client Connection
  public getSocket(): Socket<ServerToClientEvents> {
    if (!this.socket) {
      this.socket = io(this.baseUrl, {
        autoConnect: true,
      });
    }
    return this.socket;
  }
}

export const apiClient = new GatewayApiClient();
