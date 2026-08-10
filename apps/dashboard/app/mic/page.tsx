'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getGatewayUrl } from '../../lib/apiClient';

const GATEWAY_URL = getGatewayUrl();
const PATIENT_ID = 'patient-01';

type CallStatus = 'idle' | 'ringing' | 'listening' | 'processing' | 'speaking' | 'ended' | 'error';

interface TranscriptLine {
  id: string;
  speaker: 'patient' | 'system' | 'system-listening' | 'system-speaking';
  text: string;
  ts: string;
}

interface EscalationAlert {
  id: string;
  reason: string;
  timestamp: string;
}

export default function MicInputPage() {
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callId, setCallId] = useState<string>('');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [escalations, setEscalations] = useState<EscalationAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deepgramReady, setDeepgramReady] = useState<boolean | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const callIdRef = useRef<string>('');
  const patientIdRef = useRef<string>(PATIENT_ID);
  const hasConnectedOnceRef = useRef<boolean>(false);

  // Check if gateway is reachable
  useEffect(() => {
    fetch(`${GATEWAY_URL}/patients/patient-01`, { signal: AbortSignal.timeout(5000) })
      .then((r) => r.ok ? setDeepgramReady(true) : setDeepgramReady(false))
      .catch(() => setDeepgramReady(false));
  }, []);

  const playAudioFromBuffer = useCallback((arrayBuffer: ArrayBuffer) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioContextRef.current;

    ctx.decodeAudioData(arrayBuffer).then((audioBuffer) => {
      audioQueueRef.current.push(audioBuffer);

      const playNext = () => {
        if (audioQueueRef.current.length === 0) {
          isPlayingRef.current = false;
          return;
        }
        isPlayingRef.current = true;
        const buf = audioQueueRef.current.shift()!;
        const source = ctx.createBufferSource();
        source.buffer = buf;
        source.connect(ctx.destination);
        source.onended = playNext;
        source.start(0);
      };

      if (!isPlayingRef.current) {
        playNext();
      }
    }).catch((err) => {
      console.error('[mic] [RIME] Failed to decode audio:', err);
    });
  }, []);

  const startCheckin = useCallback(async () => {
    setError(null);
    setTranscript([]);
    setEscalations([]);
    setCallStatus('ringing');
    hasConnectedOnceRef.current = false;

    const newCallId = `call-mic-${Date.now()}`;
    setCallId(newCallId);
    callIdRef.current = newCallId;

    try {
      // Select patient — for now use patient-01, but this could be a dropdown
      const patientId = patientIdRef.current;

      // Get microphone access — 16kHz mono for Deepgram linear16
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // Connect Socket.io to the gateway
      console.log('[mic] [SOCKET] connecting to gateway:', GATEWAY_URL);
      const socket = io(GATEWAY_URL, { transports: ['polling', 'websocket'] });
      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('[mic] [SOCKET] connected:', socket.id);
        setCallStatus('ringing');

        // Re-emit voice:start ONLY on genuine reconnects (2nd+ connect event)
        if (hasConnectedOnceRef.current && callIdRef.current) {
          console.log('[mic] [SOCKET] Genuine reconnect during active call, re-emitting voice:start for:', callIdRef.current);
          socket.emit('voice:start', { patientId: patientIdRef.current, callId: callIdRef.current, isReconnect: true });
        } else {
          hasConnectedOnceRef.current = true;
        }
      });

      socket.on('disconnect', (reason) => {
        console.log('[mic] [SOCKET] disconnected:', reason);
      });

      socket.on('connect_error', (err) => {
        console.error('[mic] [SOCKET] connection_error:', err.message);
        setError(`Cannot connect to gateway: ${err.message}`);
        setCallStatus('error');
      });

      // Listen for call status updates
      socket.on('call:status', ({ callId: cid, status: callStatusFromGW }) => {
        console.log('[mic] [SOCKET] call:status:', cid, callStatusFromGW);
        if (status === 'ringing') setCallStatus('ringing');
      });

      // Listen for WellCall's voice response (text)
      socket.on('voice:response', ({ callId: cid, text }) => {
        console.log('[mic] [SOCKET] voice:response:', text);
        setTranscript((prev) => [
          ...prev,
          { id: `sys-${Date.now()}`, speaker: 'system', text, ts: new Date().toLocaleTimeString() },
        ]);
        setCallStatus('speaking');
      });

      // Listen for Rime audio buffer
      socket.on('voice:audio', ({ callId: cid, audio }) => {
        console.log('[mic] [RIME] Received audio buffer:', audio.byteLength, 'bytes');
        playAudioFromBuffer(audio);
        setCallStatus('listening');
      });

      // Listen for interim/final transcripts from Deepgram
      socket.on('voice:transcript', ({ callId: cid, text, isFinal }) => {
        setTranscript((prev) => {
          if (isFinal) {
            return [
              ...prev,
              { id: `pt-${Date.now()}`, speaker: 'patient', text, ts: new Date().toLocaleTimeString() },
            ];
          }
          // Replace last interim line or add new
          const lastIdx = prev.length - 1;
          if (lastIdx >= 0 && prev[lastIdx].speaker === 'patient') {
            const updated = [...prev];
            updated[lastIdx] = { ...updated[lastIdx], text };
            return updated;
          }
          return [
            ...prev,
            { id: `pi-${Date.now()}`, speaker: 'patient', text, ts: new Date().toLocaleTimeString() },
          ];
        });

        if (isFinal) {
          setCallStatus('processing');
        } else {
          setCallStatus('listening');
        }
      });

      // Listen for escalations
      socket.on('escalation:new', (esc: any) => {
        console.log('[mic] [SOCKET] escalation:new:', esc.reason);
        setEscalations((prev) => [
          ...prev,
          { id: esc.id, reason: esc.reason, timestamp: esc.timestamp },
        ]);
        if (esc.callId && esc.callId === callIdRef.current) {
          setCallStatus('ended');
        }
      });

      // Start the voice session — open Deepgram STT on the gateway
      socket.emit('voice:start', { patientId, callId: newCallId });
      setCallStatus('listening');
    } catch (err: any) {
      setError(err.message || 'Failed to access microphone');
      setCallStatus('error');
    }
  }, []);

  const stopCheckin = useCallback(() => {
    setCallStatus('processing');

    // Disconnect AudioContext
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch { /* ignore */ }
      audioContextRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;

    // Stop mic stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    // Tell gateway to close Deepgram session
    if (socketRef.current) {
      socketRef.current.emit('voice:stop', { callId: callIdRef.current });
      setTimeout(() => {
        socketRef.current?.disconnect();
        setCallStatus('ended');
      }, 3000);
    } else {
      setCallStatus('ended');
    }
  }, []);

  const reset = useCallback(() => {
    setCallStatus('idle');
    setCallId('');
    setTranscript([]);
    setEscalations([]);
    setError(null);
    socketRef.current = null;
    streamRef.current = null;
  }, []);

  const hasEscalation = escalations.length > 0;

  const getStatusIcon = () => {
    switch (callStatus) {
      case 'ringing': return '🔔';
      case 'listening': return '🎙️';
      case 'processing': return '🧠';
      case 'speaking': return '🔊';
      case 'ended': return '✅';
      case 'error': return '⚠️';
      default: return '📞';
    }
  };

  const getStatusText = () => {
    switch (callStatus) {
      case 'ringing': return 'Connecting to WellCall...';
      case 'listening': return 'Listening...';
      case 'processing': return 'WellCall is analyzing your response...';
      case 'speaking': return '🔊 WellCall is speaking...';
      case 'ended': return 'Check-in complete';
      case 'error': return 'Connection error';
      default: return 'Ready to start check-in';
    }
  };

  const isCallActive = callStatus !== 'idle' && callStatus !== 'ended' && callStatus !== 'error';

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 0', color: '#f8fafc' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '28px', fontWeight: 800, color: '#f8fafc' }}>
          WellCall Post-Discharge Check-in
        </h2>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>
          {deepgramReady === false
            ? '⚠️ Gateway not reachable. Check that the backend is running on port 3001.'
            : deepgramReady === true
            ? 'A real automated voice agent will guide your post-discharge check-in.'
            : 'Checking gateway connection...'}
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
        }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#fca5a5', marginBottom: '8px' }}>
            🚨 Nurse Escalation Triggered
          </div>
          {escalations.map((e) => (
            <div key={e.id} style={{ color: '#fecaca', fontSize: '14px' }}>
              {e.reason}
            </div>
          ))}
          <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '8px' }}>
            A nurse will contact you shortly. The escalation has been logged and sent to your care team via SMS.
          </div>
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

      {/* Status Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '16px 24px',
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '12px',
        marginBottom: '24px',
      }}>
        <span style={{ fontSize: '24px' }}>{getStatusIcon()}</span>
        <span style={{ fontSize: '16px', fontWeight: 600, color: '#e2e8f0' }}>{getStatusText()}</span>
        {callStatus === 'listening' && (
          <span style={{
            width: 12, height: 12, borderRadius: '50%',
            background: '#10b981',
            animation: 'pulse 1.5s infinite',
            display: 'inline-block',
          }} />
        )}
        {callId && (
          <span style={{ fontSize: '11px', color: '#475569', fontFamily: 'monospace', marginLeft: 'auto' }}>
            {callId}
          </span>
        )}
      </div>

      {/* Control Buttons */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '32px', alignItems: 'center' }}>
        {!isCallActive && callStatus !== 'ended' && (
          <button
            onClick={startCheckin}
            disabled={deepgramReady === false}
            style={{
              padding: '14px 32px',
              background: 'linear-gradient(135deg, #059669, #10b981)',
              border: 'none',
              borderRadius: '10px',
              color: 'white',
              fontSize: '16px',
              fontWeight: 700,
              cursor: deepgramReady === false ? 'not-allowed' : 'pointer',
              opacity: deepgramReady === false ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            🎙️ Start Check-in
          </button>
        )}

        {isCallActive && (
          <button
            onClick={stopCheckin}
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
            ⏹️ End Call
          </button>
        )}

        {callStatus === 'ended' && (
          <button
            onClick={reset}
            style={{
              padding: '14px 32px',
              background: '#334155',
              border: '1px solid #475569',
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
            🔄 New Check-in
          </button>
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
          Live Conversation
        </div>

        {transcript.length === 0 ? (
          <div style={{ color: '#334155', fontSize: '14px', textAlign: 'center', padding: '40px 0' }}>
            {callStatus === 'ringing'
              ? '🔔 Ringing...'
              : callStatus === 'listening'
              ? '🎙️ Listening... speak now'
              : callStatus === 'processing'
              ? '🧠 Analyzing your response...'
              : callStatus === 'speaking'
              ? '🔊 Playing WellCall response...'
              : 'Click Start Check-in to begin your post-discharge voice check-in.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {transcript.map((line) => (
              <div key={line.id} style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
                justifyContent: line.speaker === 'patient' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '70%',
                  padding: '12px 16px',
                  borderRadius: line.speaker === 'patient'
                    ? '18px 4px 18px 18px'
                    : '4px 18px 18px 18px',
                  background: line.speaker === 'patient'
                    ? 'linear-gradient(135deg, #0f172a, #1e293b)'
                    : '#1e293b',
                  border: line.speaker === 'patient'
                    ? '1px solid #32d74f'
                    : '1px solid #475569',
                }}>
                  <div style={{
                    fontSize: '11px',
                    color: line.speaker === 'patient' ? '#34d399' : '#60a5fa',
                    fontWeight: 600,
                    marginBottom: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    {line.speaker === 'patient' ? 'You' : 'WellCall'}
                  </div>
                  <div style={{
                    fontSize: '15px',
                    lineHeight: 1.5,
                    color: '#e2e8f0',
                  }}>
                    {line.text}
                  </div>
                  <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px', textAlign: 'right' }}>
                    {line.ts}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
