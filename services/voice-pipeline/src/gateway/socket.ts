import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'node:http';
import {
  TranscriptEntry,
  Escalation,
  CallSession,
  ServerToClientEvents,
  ClientToServerEvents,
} from '@wellcall/shared-types';
import { processTranscriptChunk } from '../index';

// Dynamic import wrapper so TS doesn't choke on @deepgram/sdk path resolution at compile time
async function createDeepgramLive(apiKey: string, options: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
  const client = createClient(apiKey);
  const conn = client.listen.live(options);
  return { conn, LiveTranscriptionEvents };
}

export class GatewaySocketManager {
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

  // Track active Deepgram live connections per callId
  private activeSessions: Map<string, {
    dgConnection: any;
    patientId: string;
  }> = new Map();

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      maxHttpBufferSize: 1e7, // 10 MB for audio blobs
    });

    this.io.on('connection', (socket: Socket<any, any>) => {
      console.log(`[gateway/socket] Client connected: ${socket.id}`);

      // --- Voice Streaming: Open Deepgram STT session ---
      socket.on('voice:start', async ({ patientId, callId }: { patientId: string; callId: string }) => {
        console.log(`[gateway/socket] voice:start — callId: ${callId}, patient: ${patientId}`);

        const apiKey = process.env.DEEPGRAM_API_KEY;
        if (!apiKey || apiKey === 'your_deepgram_api_key_here') {
          console.warn('[gateway/socket] DEEPGRAM_API_KEY not configured — voice transcription unavailable.');
          socket.emit('voice:transcript', { callId, text: '[Deepgram API key not set — transcription unavailable]', isFinal: true });
          return;
        }

        try {
          const { conn, LiveTranscriptionEvents } = await createDeepgramLive(apiKey, {
            model: 'nova-2',
            language: 'en-US',
            smart_format: true,
            interim_results: true,
            utterance_end_ms: 1500,
            vad_events: true,
          });

          this.activeSessions.set(callId, { dgConnection: conn, patientId });

          conn.on(LiveTranscriptionEvents.Transcript, async (data: any) => {
            const alt = data?.channel?.alternatives?.[0];
            const text: string = (alt?.transcript ?? '').trim();
            const isFinal: boolean = data.is_final === true;

            if (!text) return;

            // Send partial/final back to browser
            socket.emit('voice:transcript', { callId, text, isFinal });

            // Run full intelligence pipeline only on final utterances ≥3 words
            if (isFinal && text.split(' ').length >= 3) {
              console.log(`[gateway/socket] Final transcript (${text.split(' ').length} words) — running pipeline`);
              try {
                await processTranscriptChunk(callId, patientId, text);
              } catch (err) {
                console.error('[gateway/socket] Intelligence pipeline error:', err);
              }
            }
          });

          conn.on(LiveTranscriptionEvents.Error, (err: any) => {
            console.error('[gateway/socket] Deepgram error:', err);
          });

          conn.on(LiveTranscriptionEvents.Close, () => {
            console.log(`[gateway/socket] Deepgram session closed: ${callId}`);
            this.activeSessions.delete(callId);
          });

          this.emitCallStatus(callId, 'connected');
        } catch (err) {
          console.error('[gateway/socket] Failed to open Deepgram live session:', err);
        }
      });

      // --- Voice Streaming: Forward audio chunk to Deepgram ---
      socket.on('voice:chunk', ({ callId, audio }: { callId: string; patientId: string; audio: ArrayBuffer }) => {
        const session = this.activeSessions.get(callId);
        if (!session) return;
        try {
          session.dgConnection.send(Buffer.from(audio));
        } catch (err) {
          console.error('[gateway/socket] Error sending audio chunk:', err);
        }
      });

      // --- Voice Streaming: End session ---
      socket.on('voice:stop', ({ callId }: { callId: string }) => {
        console.log(`[gateway/socket] voice:stop — callId: ${callId}`);
        const session = this.activeSessions.get(callId);
        if (session) {
          try { session.dgConnection.finish(); } catch { /* ignore */ }
          this.activeSessions.delete(callId);
        }
        this.emitCallStatus(callId, 'ended');
      });

      socket.on('disconnect', () => {
        console.log(`[gateway/socket] Client disconnected: ${socket.id}`);
        // Clean up any lingering sessions
        for (const [callId, session] of this.activeSessions.entries()) {
          try { session.dgConnection.finish(); } catch { /* ignore */ }
          this.activeSessions.delete(callId);
        }
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
