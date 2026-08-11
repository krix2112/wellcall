'use client';

import React, { useEffect, useState } from 'react';
import { TranscriptEntry } from '@wellcall/shared-types';
import { onTranscriptNew } from '../lib/apiClient';

export default function LiveTranscript() {
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);

  useEffect(() => {
    // Subscribe to transcript:new socket event
    const unsubscribe = onTranscriptNew((entry: TranscriptEntry) => {
      console.log('[LiveTranscript] Received transcript:new event:', entry);
      setTranscripts((prev) => [...prev, entry]);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div style={{ padding: '8px 0', fontFamily: 'sans-serif' }}>
      {transcripts.length === 0 ? (
        <p style={{ color: '#888', fontStyle: 'italic' }}>
          Waiting for live transcript:new socket events...
        </p>
      ) : (
        <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {transcripts.map((item) => (
            <div
              key={item.id}
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: item.speaker === 'system' ? '#f0f4f8' : '#fff8e6',
                borderLeft: item.speaker === 'system' ? '4px solid #0284c7' : '4px solid #d97706',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                <span style={{ fontWeight: 'bold' }}>
                  {item.speaker === 'system' ? 'System / Wellcall Agent' : 'Patient'}
                </span>
                <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
              </div>
              <div style={{ fontSize: '14px', color: '#1e293b' }}>{item.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
