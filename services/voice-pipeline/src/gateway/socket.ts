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
import { getPatientById, insertCall, getCallById } from './db';
import { getDeepgramClient } from '../sttClient';

// Allowed dashboard origins for CORS (browser frontend + gateway backend separation).
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean)
  : DEFAULT_ALLOWED_ORIGINS;

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
      pingInterval: 10000,   // 10s ping interval for cloud reverse proxy stability
      pingTimeout: 10000,    // 10s ping timeout
    });

    this.io.on('connection', (socket: Socket<any, any>) => {
      console.log(`[gateway/socket] Client connected: ${socket.id}`);

      // --- Voice Streaming: Open Deepgram STT session ---
      socket.on('voice:start', async ({ patientId, callId, isReconnect }: { patientId: string; callId: string; isReconnect?: boolean }) => {
        console.log(`[gateway/socket] [CALL] voice:start — callId: ${callId}, patient: ${patientId}, isReconnect: ${!!isReconnect}`);

        // Fetch patient info for context-aware responses
        const patient = await getPatientById(patientId);
        const patientName = patient?.name;
        const patientCondition = patient?.condition;

        // Create or update call record in DB
        const existingCall = await getCallById(callId);
        const isExisting = !!existingCall || !!isReconnect;
        const callSession: CallSession = {
          id: callId,
          patientId,
          status: 'connected',
          startedAt: existingCall?.startedAt || new Date().toISOString(),
        };
        await insertCall(callSession);
        console.log(`[gateway/socket] [CALL] created call record: ${callId}`);

        try {
          const dg = getDeepgramClient();

          const conn = dg.transcription.live({
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

          let hasSentGreeting = false;

          const onTranscript = async (data: any) => {
            let payload: any = data;
            if (typeof data === 'string') {
              try { payload = JSON.parse(data); } catch { /* ignore */ }
            } else if (data && typeof data.data === 'string') {
              try { payload = JSON.parse(data.data); } catch { payload = data; }
            }

            const alt = payload?.channel?.alternatives?.[0];
            const text: string = (alt?.transcript ?? '').trim();
            const isFinal: boolean = payload?.is_final === true;

            if (!text) return;

            console.log(`[gateway/socket] [DEEPGRAM] transcript (${isFinal ? 'FINAL' : 'INTERIM'}): "${text}"`);

            // Send live transcript back to browser
            socket.emit('voice:transcript', { callId, text, isFinal });

            if (!hasSentGreeting && isFinal) {
              hasSentGreeting = true;
            }

            // Run full intelligence pipeline only on final utterances ≥3 words
            if (isFinal && text.split(' ').length >= 3) {
              console.log(`[gateway/socket] [PROCESS] Final transcript (${text.split(' ').length} words) — running pipeline`);
              await this.handlePatientTranscript(socket, callId, patientId, text, patientName, patientCondition);
            }
          };

          conn.on('transcriptReceived', onTranscript);
          conn.on('error', (err: any) => console.error('[gateway/socket] Deepgram error:', err));
          conn.on('close', () => {
            console.log(`[gateway/socket] Deepgram session closed: ${callId}`);
            this.activeSessions.delete(callId);
          });

          this.emitCallStatus(callId, 'connected');

          // Synthesize initial greeting ONLY for fresh new calls (not reconnects)
          if (!isExisting) {
            const name = patientName?.split(' ')[0] || 'there';
            const greetingText = `Hello ${name}, this is WellCall checking in after your discharge. How are you feeling today?`;
            socket.emit('voice:response', { callId, text: greetingText });

            const rimeApiKey = process.env.RIME_API_KEY;
            if (rimeApiKey && rimeApiKey !== 'your_rime_api_key_here') {
              try {
                console.log(`[gateway/socket] [RIME] Synthesizing greeting audio for live session ${callId}: "${greetingText}"`);
                const audioBuffer = await this.rimeClient.speak(greetingText);
                if (audioBuffer && audioBuffer.byteLength > 0) {
                  console.log(`[gateway/socket] [RIME] Emitting greeting audio buffer (${audioBuffer.byteLength} bytes)`);
                  this.emitVoiceAudio(callId, audioBuffer);
                } else {
                  console.warn(`[gateway/socket] [RIME] Empty audio buffer for callId ${callId}`);
                }
              } catch (err) {
                console.warn(`[gateway/socket] [RIME] Greeting audio synthesis failed for callId ${callId}:`, err);
              }
            }
          }
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

      // --- Initiate Call Greeting ---
      socket.on('call:start', async ({ patientId }: { patientId: string }) => {
        console.log(`[gateway/socket] [CALL] call:start request for patient: ${patientId}`);
        const callId = `call-web-${Date.now()}`;
        socket.emit('call:status', { callId, status: 'ringing' });

        const patient = await getPatientById(patientId);
        const name = patient?.name?.split(' ')[0] || 'there';
        const greetingText = `Hello ${name}, this is WellCall checking in after your discharge. How are you feeling today?`;

        // Emit text response to browser UI
        socket.emit('voice:response', { callId, text: greetingText });

        // Synthesize Rime TTS audio greeting
        const rimeApiKey = process.env.RIME_API_KEY;
        if (rimeApiKey && rimeApiKey !== 'your_rime_api_key_here') {
          try {
            console.log(`[gateway/socket] [RIME] Synthesizing greeting audio: "${greetingText}"`);
            const audioBuffer = await this.rimeClient.speak(greetingText);
            if (audioBuffer && audioBuffer.byteLength > 0) {
              console.log(`[gateway/socket] [RIME] Emitting greeting audio buffer (${audioBuffer.byteLength} bytes)`);
              this.emitVoiceAudio(callId, audioBuffer);
            } else {
              console.warn(`[gateway/socket] [RIME] Empty audio buffer returned for callId ${callId}: "${greetingText}"`);
            }
          } catch (err) {
            console.warn(`[gateway/socket] [RIME] Greeting audio synthesis failed for callId ${callId} ("${greetingText}"):`, err);
          }
        }

        socket.emit('call:status', { callId, status: 'connected' });
      });

      socket.on('disconnect', () => {
        console.log(`[gateway/socket] Client disconnected: ${socket.id}`);
        for (const [callId, session] of this.activeSessions.entries()) {
          try { session.dgConnection.finish(); } catch { /* ignore */ }
          this.activeSessions.delete(callId);
        }
      });
    });
  }

  /**
   * Process patient utterance through intelligence pipeline + generate voice response
   */
  private async handlePatientTranscript(
    socket: Socket,
    callId: string,
    patientId: string,
    text: string,
    patientName?: string,
    patientCondition?: string
  ): Promise<void> {
    try {
      // 1. Run intelligence pipeline (Groq -> Qdrant -> Risk Engine -> DB)
      const { extracted, redFlagMatch, decision } = await processTranscriptChunk(callId, patientId, text);

      // 2. Generate context-aware Conversational AI Response
      let responseText = '';
      if (decision.action === 'escalate') {
        responseText = 'I understand you are experiencing symptoms. I am notifying your care team and escalating to a nurse immediately. Please stay calm.';
      } else {
        try {
          responseText = await generateWellCallResponse(
            text,
            { name: patientName, condition: patientCondition },
            extracted,
            redFlagMatch,
            decision
          );
        } catch {
          responseText = 'Thank you for providing that update. I have logged this check-in for your care team.';
        }
      }

      console.log(`[gateway/socket] [AI RESPONSE] "${responseText}"`);
      socket.emit('voice:response', { callId, text: responseText });

      // 3. Synthesize voice audio via Rime TTS
      const rimeApiKey = process.env.RIME_API_KEY;
      if (rimeApiKey && rimeApiKey !== 'your_rime_api_key_here') {
        try {
          console.log(`[gateway/socket] [RIME] Synthesizing response audio...`);
          const audioBuffer = await this.rimeClient.speak(responseText);
          if (audioBuffer && audioBuffer.byteLength > 0) {
            console.log(`[gateway/socket] [RIME] Emitting response audio buffer (${audioBuffer.byteLength} bytes)`);
            this.emitVoiceAudio(callId, audioBuffer);
          } else {
            console.warn(`[gateway/socket] [RIME] Empty audio buffer returned for callId ${callId}: "${responseText}"`);
          }
        } catch (err) {
          console.warn(`[gateway/socket] [RIME] Audio synthesis failed for callId ${callId} ("${responseText}"):`, err);
        }
      }

      if (decision.action === 'escalate') {
        socket.emit('call:status', { callId, status: 'ended' });
      }
    } catch (err) {
      console.error('[gateway/socket] Error processing transcript chunk:', err);
    }
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

  public emitVoiceAudio(callId: string, audio: Buffer | ArrayBuffer): void {
    console.log(`[gateway/socket] Emitting voice:audio -> ${callId} (${audio.byteLength} bytes)`);
    this.io.emit('voice:audio', { callId, audio: audio as any });
  }
}
