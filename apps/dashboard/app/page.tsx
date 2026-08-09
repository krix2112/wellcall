import React from 'react';
import LiveTranscript from '../components/LiveTranscript';
import CarePlanCard from '../components/CarePlanCard';

export default function HomePage() {
  return (
    <main style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 16px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
        Wellcall Phase 1 Live Gateway & Care Plan Demo
      </h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        Live monitoring dashboard displaying patient care plan and real-time transcript stream.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px', alignItems: 'start' }}>
        <CarePlanCard patientId="patient-01" />
        <LiveTranscript />
      </div>
    </main>
  );
}
