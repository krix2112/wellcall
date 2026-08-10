'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3001';
const PATIENT_ID = 'patient-01';

type Status = 'idle' | 'connecting' | 'recording' | 'processing' | 'stopped';

interface TranscriptLine {
  id: string;
  text: string;
  isFinal: boolean;
  ts: string;
  action?: 'escalate' | 'log';
}

interface EscalationAlert {
  id: string;
  reason: string;
  timestamp: string;
}

export default function MicInputPage() {
  const [status, setStatus] = useState<Status>('idle');
  const [callId, setCallId] = useState<string>('');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [escalations, setEscalations] = useState<EscalationAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deepgramReady, setDeepgramReady] = useState<boolean | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string>('');

  // Check if Deepgram API key is configured
  useEffect(() => {
    fetch(`${GATEWAY_URL}/patients/patient-01`)
      .then((r) => r.ok ? setDeepgramReady(true) : setDeepgramReady(false))
      .catch(() => setDeepgramReady(false));
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript([]);
    setEscalations([]);
    setStatus('connecting');

    const newCallId = `call-mic-${Date.now()}`;
    setCallId(newCallId);
    callIdRef.current = newCallId;

    try {
      // 1. Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // 2. Connect Socket.io
      const socket = io(GATEWAY_URL, { transports: ['websocket'] });
      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('[mic] Socket connected, starting voice session');

        // 3. Tell gateway to open Deepgram session
        socket.emit('voice:start', { patientId: PATIENT_ID, callId: newCallId });

        // 4. Start MediaRecorder — sends webm/opus chunks every 250ms
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg;codecs=opus';

        const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 16000 });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = async (e) => {
          if (e.data.size > 0 && socketRef.current?.connected) {
            const arrayBuf = await e.data.arrayBuffer();
            socketRef.current.emit('voice:chunk', {
              callId: callIdRef.current,
              patientId: PATIENT_ID,
              audio: arrayBuf,
            });
          }
        };

        recorder.start(250); // 250ms chunks
        setStatus('recording');
      });

      // 5. Listen for live partial transcripts from Deepgram
      socket.on('voice:transcript', ({ callId: cid, text, isFinal }) => {
        setTranscript((prev) => {
          // Replace the last interim line if not final, else add new
          const last = prev[prev.length - 1];
          if (last && !last.isFinal) {
            return [
              ...prev.slice(0, -1),
              { id: last.id, text, isFinal, ts: new Date().toLocaleTimeString() },
            ];
          }
          return [
            ...prev,
            { id: `t-${Date.now()}`, text, isFinal, ts: new Date().toLocaleTimeString() },
          ];
        });
      });

      // 6. Listen for full transcript entries (post-pipeline)
      socket.on('transcript:new', (entry) => {
        setTranscript((prev) => {
          const exists = prev.some((t) => t.text === entry.text && t.isFinal);
          if (exists) return prev;
          return [
            ...prev,
            {
              id: entry.id,
              text: `✅ ${entry.text}`,
              isFinal: true,
              ts: new Date(entry.timestamp).toLocaleTimeString(),
            },
          ];
        });
      });

      // 7. Listen for escalations
      socket.on('escalation:new', (esc) => {
        setEscalations((prev) => [
          ...prev,
          { id: esc.id, reason: esc.reason, timestamp: esc.timestamp },
        ]);
      });

      socket.on('connect_error', (err) => {
        setError(`Cannot connect to gateway: ${err.message}`);
        setStatus('idle');
      });
    } catch (err: any) {
      setError(err.message || 'Failed to access microphone');
      setStatus('idle');
    }
  }, []);

  const stopRecording = useCallback(() => {
    setStatus('processing');

    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Stop mic stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    // Tell gateway to close Deepgram session
    if (socketRef.current) {
      socketRef.current.emit('voice:stop', { callId: callIdRef.current });
      setTimeout(() => {
        socketRef.current?.disconnect();
        setStatus('stopped');
      }, 2000); // wait 2s for final transcripts to flush
    } else {
      setStatus('stopped');
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setCallId('');
    setTranscript([]);
    setEscalations([]);
    setError(null);
  }, []);

  const hasEscalation = escalations.length > 0;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 0' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '28px', fontWeight: 800, color: '#f8fafc' }}>
          🎙️ Live Voice Check-in
        </h2>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>
          Speak into your microphone. Wellcall will transcribe in real-time, extract clinical fields, and escalate if needed.
        </p>
      </div>

      {/* Escalation Banner */}
      {hasEscalation && (
        <div style={{
          background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
          border: '1px solid #ef4444',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '24px',
          animation: 'pulse 2s infinite',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#fca5a5', marginBottom: '8px' }}>
            🚨 ESCALATION TRIGGERED
          </div>
          {escalations.map((e) => (
            <div key={e.id} style={{ color: '#fecaca', fontSize: '14px' }}>
              {e.reason}
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: '#1e1b2e',
          border: '1px solid #a78bfa',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '24px',
          color: '#c4b5fd',
          fontSize: '14px',
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Control Buttons */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '32px', alignItems: 'center' }}>
        {status === 'idle' || status === 'stopped' ? (
          <button
            id="btn-start-recording"
            onClick={status === 'stopped' ? reset : startRecording}
            style={{
              padding: '14px 32px',
              background: 'linear-gradient(135deg, #059669, #10b981)',
              border: 'none',
              borderRadius: '10px',
              color: 'white',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {status === 'stopped' ? '🔄 New Session' : '🎙️ Start Recording'}
          </button>
        ) : status === 'recording' ? (
          <button
            id="btn-stop-recording"
            onClick={stopRecording}
            style={{
              padding: '14px 32px',
              background: 'linear-gradient(135deg, #b91c1c, #ef4444)',
              border: 'none',
              borderRadius: '10px',
              color: 'white',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            ⏹️ Stop Recording
          </button>
        ) : null}

        {/* Status badge */}
        <div style={{
          padding: '8px 16px',
          borderRadius: '20px',
          fontSize: '13px',
          fontWeight: 600,
          background: status === 'recording' ? '#064e3b' : status === 'connecting' ? '#1e3a5f' : status === 'processing' ? '#1e1b2e' : '#1e293b',
          color: status === 'recording' ? '#34d399' : status === 'connecting' ? '#60a5fa' : status === 'processing' ? '#a78bfa' : '#94a3b8',
          border: `1px solid ${status === 'recording' ? '#10b981' : status === 'connecting' ? '#3b82f6' : status === 'processing' ? '#7c3aed' : '#334155'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          {status === 'recording' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block', animation: 'pulse 1s infinite' }} />}
          {status === 'recording' ? 'Recording Live' : status === 'connecting' ? 'Connecting...' : status === 'processing' ? 'Processing...' : status === 'stopped' ? 'Session Ended' : 'Ready'}
        </div>

        {callId && (
          <div style={{ fontSize: '11px', color: '#475569', fontFamily: 'monospace' }}>
            {callId}
          </div>
        )}
      </div>

      {/* Live Transcript */}
      <div style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '12px',
        padding: '20px',
        minHeight: '200px',
      }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
          Live Transcript
        </div>

        {transcript.length === 0 ? (
          <div style={{ color: '#334155', fontSize: '14px', textAlign: 'center', padding: '40px 0' }}>
            {status === 'recording' ? '🎙️ Listening... speak now' : 'Transcript will appear here during the call'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {transcript.map((line) => (
              <div key={line.id} style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
                opacity: line.isFinal ? 1 : 0.6,
              }}>
                <span style={{ color: '#475569', fontSize: '11px', whiteSpace: 'nowrap', paddingTop: '2px', fontFamily: 'monospace' }}>
                  {line.ts}
                </span>
                <span style={{
                  color: line.isFinal ? '#e2e8f0' : '#94a3b8',
                  fontSize: '15px',
                  lineHeight: 1.5,
                  fontStyle: line.isFinal ? 'normal' : 'italic',
                }}>
                  {line.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Instructions */}
      {status === 'idle' && (
        <div style={{
          marginTop: '24px',
          padding: '16px 20px',
          background: '#0f172a',
          borderRadius: '10px',
          border: '1px solid #1e293b',
        }}>
          <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: '10px', fontSize: '13px' }}>HOW IT WORKS</div>
          <ol style={{ margin: 0, padding: '0 0 0 20px', color: '#64748b', fontSize: '13px', lineHeight: '2' }}>
            <li>Click <strong style={{ color: '#10b981' }}>Start Recording</strong> and allow microphone access</li>
            <li>Speak as a patient — e.g., <em>"My chest feels tight when I breathe"</em></li>
            <li>Your speech is transcribed via <strong style={{ color: '#38bdf8' }}>Deepgram Nova-2</strong> in real-time</li>
            <li>Final utterances go through <strong style={{ color: '#a78bfa' }}>Groq LLM + Qdrant</strong> risk matching</li>
            <li>If a red flag is detected, an <strong style={{ color: '#ef4444' }}>escalation alert</strong> fires instantly</li>
          </ol>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
