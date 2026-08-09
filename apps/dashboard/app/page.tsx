import React from 'react';
import LiveTranscript from '../components/LiveTranscript';
import CarePlanCard from '../components/CarePlanCard';
import RiskFlagBanner from '../components/RiskFlagBanner';

export default function HomePage() {
  return (
    <main style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 16px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
        Wellcall Phase 1 Live Gateway & Escalation Demo
      </h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        Live monitoring dashboard displaying real-time patient care plan, risk escalations, and transcript stream.
      </p>

      {/* Prominent Risk Escalation Banner Section */}
      <RiskFlagBanner patientId="patient-01" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px', items: 'start' }}>
        <CarePlanCard patientId="patient-01" />
        <LiveTranscript />
      </div>
    </main>
  );
}
