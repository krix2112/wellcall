import React from 'react';
import LiveTranscript from '../../../components/LiveTranscript';
import CarePlanCard from '../../../components/CarePlanCard';
import CallHistoryTimeline from '../../../components/CallHistoryTimeline';

export default function PatientPage({ params }: { params: { id: string } }) {
  const patientId = params.id;

  const mockPatient = {
    id: patientId,
    name: 'Jane Smith',
    condition: 'Post-Coronary Artery Bypass Graft (CABG)',
    dischargeDate: '2026-08-01',
    followUpDate: '2026-08-15',
    medications: [
      { name: 'Aspirin', dosage: '81mg', frequency: 'Once daily', purpose: 'Antiplatelet' },
      { name: 'Atorvastatin', dosage: '40mg', frequency: 'At bedtime', purpose: 'Lipid control' },
    ],
    redFlags: [
      {
        id: 'rf-cabg-01',
        category: 'cardiac',
        description: 'Chest tightness, pain, or heavy pressure',
        severity: 'critical' as const,
        exampleUtterances: ['chest feels tight', 'heavy chest', 'chest pressure'],
      },
    ],
    emergencyContacts: [
      { name: 'Robert Smith', relationship: 'Spouse', phone: '+1 (555) 019-2831' },
    ],
  };

  const initialTranscripts = [
    {
      id: 'tr-1',
      callId: 'call-101',
      patientId,
      timestamp: new Date().toISOString(),
      speaker: 'agent' as const,
      text: 'Hello Jane, this is Wellcall checking in on your recovery after surgery.',
      isFinal: true,
    },
    {
      id: 'tr-2',
      callId: 'call-101',
      patientId,
      timestamp: new Date().toISOString(),
      speaker: 'patient' as const,
      text: 'Hello. My chest feels tight when I take a deep breath today.',
      isFinal: true,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <a href="/" className="text-xs text-cyan-400 hover:underline">← Back to Active Patients</a>
          <h2 className="text-2xl font-bold text-white mt-1">Patient View: {mockPatient.name}</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <LiveTranscript initialEntries={initialTranscripts} />
          <CallHistoryTimeline entries={initialTranscripts} />
        </div>

        <div>
          <CarePlanCard patient={mockPatient} />
        </div>
      </div>
    </div>
  );
}
