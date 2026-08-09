import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'node:http';
import { TranscriptEntry, Escalation, CallSession, ServerToClientEvents, ClientToServerEvents } from '@wellcall/shared-types';

export class GatewaySocketManager {
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', (socket) => {
      console.log(`[gateway/socket] Client connected: ${socket.id}`);

      socket.on('disconnect', () => {
        console.log(`[gateway/socket] Client disconnected: ${socket.id}`);
      });
    });
  }

  // --- Typed Socket Emit Helpers ---

  public emitTranscriptNew(entry: TranscriptEntry): void {
    console.log(`[gateway/socket] Emitting transcript:new -> "${entry.text}"`);
    this.io.emit('transcript:new', entry);
  }

  public emitEscalationNew(escalation: Escalation): void {
    console.log(`[gateway/socket] Emitting escalation:new -> ${escalation.reason}`);
    this.io.emit('escalation:new', escalation);
  }

  public emitCallStatus(callId: string, status: CallSession['status']): void {
    console.log(`[gateway/socket] Emitting call:status -> ${callId}: ${status}`);
    this.io.emit('call:status', { callId, status });
  }
}
