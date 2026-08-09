import React from 'react';
import LiveTranscript from '../components/LiveTranscript';

export default function HomePage() {
  return (
    <main style={{ maxWidth: '800px', margin: '40px auto', padding: '0 16px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
        Wellcall Phase 1 Live Gateway Demo
      </h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        Minimal dashboard rendering live transcript socket events from the Gateway server.
      </p>

      <LiveTranscript />
    </main>
  );
}
