import React from 'react';
import LiveTranscript from '../components/LiveTranscript';
import CarePlanCard from '../components/CarePlanCard';
import RiskFlagBanner from '../components/RiskFlagBanner';
import CallHistoryTimeline from '../components/CallHistoryTimeline';

export default function HomePage() {
  return (
    <main style={{ maxWidth: '1100px', margin: '40px auto', padding: '0 16px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
        Wellcall Phase 1 Live Gateway & Cross-Call Memory Demo
      </h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        Live monitoring dashboard displaying real-time patient care plan, risk escalations, transcript stream, and cross-call history timeline.
      </p>

      {/* Prominent Risk Escalation Banner Section */}
      <RiskFlagBanner patientId="patient-01" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px', alignItems: 'start' }}>
        <CarePlanCard patientId="patient-01" />
        <CallHistoryTimeline patientId="patient-01" />
      </div>

      <LiveTranscript />
    </main>
  );
}
