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
import { RimeClient } from '../rimeClient';
import { generateWellCallResponse } from '@wellcall/extraction';
import { getPatientById, insertCall } from './db';

// Allowed dashboard origins for CORS (browser frontend + gateway backend separation).
// The gateway listens on its own port (default 3001) and the Next.js dashboard
// listens on its own port (default 3000). Both must be explicitly allowed.
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

// Create a Deepgram v1 SDK live transcription connection.
// Uses the legacy `Deepgram` constructor + `transcription.live` API
// matching the installed @deepgram/sdk@1.21.0 (NOT the v3 `createClient` API).
function createDeepgramLive(apiKey: string, options: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sdk = require('@deepgram/sdk');
  const dg = new sdk.Deepgram(apiKey);
  const conn = dg.transcription.live(options);
  return { conn };
}

export class GatewaySocketManager {
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;
  private rimeClient: RimeClient;

  // Track active Deepgram live connections per callId
  private activeSessions: Map<string, {
    dgConnection: any;
    patientId: string;
    patientName?: string;
    patientCondition?: string;
    callId: string;
  }> = new Map();

  constructor(httpServer: HTTPServer) {
    this.rimeClient = new RimeClient();
    this.io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
      cors: {
        origin: ALLOWED_ORIGINS,
        methods: ['GET', 'POST'],
      },
      maxHttpBufferSize: 1e7, // 10 MB for audio blobs
    });

    this.io.on('connection', (socket: Socket<any, any>) => {
      console.log(`[gateway/socket] Client connected: ${socket.id}`);

      // --- Voice Streaming: Open Deepgram STT session ---
      socket.on('voice:start', async ({ patientId, callId }: { patientId: string; callId: string }) => {
        console.log(`[gateway/socket] [CALL] voice:start — callId: ${callId}, patient: ${patientId}`);

        // Fetch patient info for context-aware responses
        const patient = await getPatientById(patientId);
        const patientName = patient?.name;
        const patientCondition = patient?.condition;

        // Create call record in DB
        const callSession: CallSession = {
          id: callId,
          patientId,
          status: 'connected',
          startedAt: new Date().toISOString(),
        };
        await insertCall(callSession);
        console.log(`[gateway/socket] [CALL] created call record: ${callId}`);

        const apiKey = process.env.DEEPGRAM_API_KEY;
        if (!apiKey || apiKey === 'your_deepgram_api_key_here') {
          console.warn('[gateway/socket] DEEPGRAM_API_KEY not configured — voice transcription unavailable.');
          socket.emit('voice:transcript', { callId, text: '[Deepgram API key not set — transcription unavailable]', isFinal: true });
          return;
        }

        try {
          const { conn } = createDeepgramLive(apiKey, {
            model: 'nova-3',
            language: 'en-US',
            smart_format: true,
            interim_results: true,
            utterance_end_ms: 1500,
            vad_events: true,
            encoding: 'linear16',
            sample_rate: 16000,
            channels: 1,
          });

          this.activeSessions.set(callId, { dgConnection: conn, patientId, patientName, patientCondition, callId });

          // v1 SDK emits 'transcriptReceived' with a raw JSON string payload
          let hasSentGreeting = false;

          conn.on('transcriptReceived', async (raw: any) => {
            let data: any = raw;
            if (typeof raw === 'string') {
              try { data = JSON.parse(raw); } catch { /* ignore parse failures */ }
            } else if (raw && typeof raw.data === 'string') {
              try { data = JSON.parse(raw.data); } catch { data = raw; }
            }

            const alt = data?.channel?.alternatives?.[0];
            const text: string = (alt?.transcript ?? '').trim();
            const isFinal: boolean = data.is_final === true;

            if (!text) return;

            console.log(`[gateway/socket] [DEEPGRAM] transcript (${isFinal ? 'FINAL' : 'INTERIM'}): "${text}"`);

            // Send live transcript back to browser
            socket.emit('voice:transcript', { callId, text, isFinal });

            // On first connection, emit a "listening" status
            if (!hasSentGreeting && isFinal) {
              hasSentGreeting = true;
            }

            // Run full intelligence pipeline only on final utterances ≥3 words
            if (isFinal && text.split(' ').length >= 3) {
              console.log(`[gateway/socket] [PROCESS] Final transcript (${text.split(' ').length} words) — running pipeline`);
              await this.handlePatientTranscript(socket, callId, patientId, text, patientName, patientCondition);
            }
          });

          conn.on('error', (err: any) => {
            console.error('[gateway/socket] Deepgram error:', err);
          });

          conn.on('close', () => {
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
        console.log(`[gateway/socket] [CALL] voice:stop — callId: ${callId}`);
        const session = this.activeSessions.get(callId);
        if (session) {
          try { session.dgConnection.finish(); } catch { /* ignore */ }
          this.activeSessions.delete(callId);
        }
        this.emitCallStatus(callId, 'ended');
      });

      // --- Start a real browser-initiated call (greeting via Rime) ---
      socket.on('call:start', async ({ patientId }: { patientId: string }) => {
        const targetPatientId = patientId || 'patient-01';
        const patient = await getPatientById(targetPatientId);

        const sessionCallId = `call-browser-${Date.now()}`;
        const callSession: CallSession = {
          id: sessionCallId,
          patientId: targetPatientId,
          status: 'ringing',
          startedAt: new Date().toISOString(),
        };
        await insertCall(callSession);
        this.emitCallStatus(sessionCallId, 'ringing');

        // Greeting via Rime
        const greeting = patient
          ? `Hello ${patient.name}, this is WellCall checking in on your recovery. How are you feeling today?`
          : 'Hello, this is WellCall. How are you feeling today?';

        console.log(`[gateway/socket] [RIME] Greeting for ${targetPatientId}: "${greeting}"`);
        socket.emit('voice:response', { callId: sessionCallId, text: greeting, isFinal: true });
        this.emitCallStatus(sessionCallId, 'connected');

        try {
          const audioBuffer = await this.rimeClient.speak(greeting);
          console.log(`[gateway/socket] [RIME] Greeting audio sent (${audioBuffer.length} bytes)`);
          socket.emit('voice:audio', { callId: sessionCallId, audio: audioBuffer.buffer });
        } catch (err) {
          console.error('[gateway/socket] [RIME] Greeting TTS failed:', err instanceof Error ? err.message : err);
        }
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

  /**
   * Process a patient transcript through the full pipeline:
   * Groq extraction → Qdrant red-flag match → Risk engine →
   * Groq response generation → Rime TTS → browser audio.
   */
  private async handlePatientTranscript(
    socket: Socket<any, any>,
    callId: string,
    patientId: string,
    transcriptText: string,
    patientName?: string,
    patientCondition?: string,
  ): Promise<void> {
    try {
      // 1. Run the full intelligence pipeline
      const { extracted, redFlagMatch, decision } = await processTranscriptChunk(callId, patientId, transcriptText);

      // 2. Generate WellCall's conversational response
      const wellcallResponse = await generateWellCallResponse(transcriptText, {
        name: patientName,
        condition: patientCondition,
      }, extracted, redFlagMatch, decision);

      console.log(`[gateway/socket] [RIME] Generating TTS for response: "${wellcallResponse}"`);

      // 3. Emit WellCall's text response to browser
      socket.emit('voice:response', { callId, text: wellcallResponse, isFinal: true });

      // 4. Synthesize with Rime and emit audio
      try {
        const audioBuffer = await this.rimeClient.speak(wellcallResponse);
        console.log(`[gateway/socket] [RIME] Audio generated (${audioBuffer.length} bytes), sending to browser`);
        socket.emit('voice:audio', { callId, audio: audioBuffer.buffer });
      } catch (err) {
        console.error('[gateway/socket] [RIME] TTS synthesis failed:', err instanceof Error ? err.message : err);
        socket.emit('voice:transcript', {
          callId,
          text: `[TTS unavailable: ${(err as Error).message || 'unknown error'}]`,
          isFinal: true,
        });
      }
    } catch (err) {
      console.error('[gateway/socket] [PROCESS] Intelligence pipeline error:', err);
    }
  }

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
