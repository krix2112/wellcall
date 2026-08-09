import React from 'react';
import LiveTranscript from '../../../components/LiveTranscript';
import CarePlanCard from '../../../components/CarePlanCard';
import CallHistoryTimeline from '../../../components/CallHistoryTimeline';
import { Patient, TranscriptEntry } from '@wellcall/shared-types';

export default function PatientPage({ params }: { params: { id: string } }) {
  const patientId = params.id;

  const mockPatient: Patient = {
    id: patientId,
    name: 'Jane Smith',
    condition: 'Post-Coronary Artery Bypass Graft (CABG)',
    followUpDate: '2026-08-15',
    medications: [
      { name: 'Aspirin', dosage: '81mg', frequency: 'Once daily', purpose: 'Antiplatelet' },
      { name: 'Atorvastatin', dosage: '40mg', frequency: 'At bedtime', purpose: 'Lipid control' },
    ],
    redFlagSymptoms: [
      'Chest tightness, pain, or heavy pressure',
      'Shortness of breath while resting',
    ],
  };

  const initialTranscripts: TranscriptEntry[] = [
    {
      id: 'tr-1',
      callId: 'call-101',
      timestamp: new Date().toISOString(),
      speaker: 'system',
      text: 'Hello Jane, this is Wellcall checking in on your recovery after surgery.',
    },
    {
      id: 'tr-2',
      callId: 'call-101',
      timestamp: new Date().toISOString(),
      speaker: 'patient',
      text: 'Hello. My chest feels tight when I take a deep breath today.',
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
          <LiveTranscript />
          <CallHistoryTimeline entries={initialTranscripts} />
        </div>

        <div>
          <CarePlanCard patient={mockPatient} />
        </div>
      </div>
    </div>
  );
}
