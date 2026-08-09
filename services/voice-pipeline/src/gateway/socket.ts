import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'node:http';
import { TranscriptEntry, Escalation, CallStatus, ServerToClientEvents, ClientToServerEvents } from '@wellcall/shared-types';

export class GatewaySocketManager {
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.setupListeners();
  }

  private setupListeners(): void {
    this.io.on('connection', (socket) => {
      console.log(`[socket.io] Client connected: ${socket.id}`);

      socket.on('disconnect', () => {
        console.log(`[socket.io] Client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Broadcast real-time transcript entry event
   */
  public emitTranscriptNew(entry: TranscriptEntry): void {
    console.log(`[socket.io] Emitting transcript:new -> "${entry.text}"`);
    this.io.emit('transcript:new', entry);
  }

  /**
   * Broadcast critical escalation event
   */
  public emitEscalationNew(escalation: Escalation): void {
    console.log(`[socket.io] Emitting escalation:new -> ${escalation.patientName} (${escalation.riskTier})`);
    this.io.emit('escalation:new', escalation);
  }

  /**
   * Broadcast call session status change
   */
  public emitCallStatus(callId: string, status: CallStatus): void {
    console.log(`[socket.io] Emitting call:status -> ${callId}: ${status}`);
    this.io.emit('call:status', { callId, status });
  }
}
