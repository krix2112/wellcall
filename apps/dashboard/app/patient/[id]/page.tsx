'use client';

import React, { useEffect, useState } from 'react';
import LiveTranscript from '../../../components/LiveTranscript';
import CarePlanCard from '../../../components/CarePlanCard';
import CallHistoryTimeline from '../../../components/CallHistoryTimeline';
import { getPatientById } from '../../../lib/apiClient';
import { Patient } from '@wellcall/shared-types';

export default function PatientPage({ params }: { params: { id: string } }) {
  const patientId = params.id;
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPatientById(patientId)
      .then((fetched) => {
        if (fetched) {
          setPatient(fetched);
        } else {
          setError(`Patient "${patientId}" not found.`);
        }
      })
      .catch(() => {
        setError('Failed to load patient data.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [patientId]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <a href="/" className="text-xs text-cyan-400 hover:underline">← Back to Active Patients</a>
          {loading ? (
            <h2 className="text-2xl font-bold text-white mt-1">Loading patient...</h2>
          ) : error ? (
            <h2 className="text-2xl font-bold text-rose-400 mt-1">{error}</h2>
          ) : (
            <h2 className="text-2xl font-bold text-white mt-1">Patient View: {patient?.name}</h2>
          )}
        </div>
      </div>

      {error ? (
        <div className="bg-rose-950/40 border border-rose-800/60 p-4 rounded-lg text-rose-200">
          {error}
        </div>
      ) : loading ? (
        <div className="bg-slate-900 border border-slate-800 text-slate-400 rounded-xl p-5 shadow animate-pulse">
          Loading patient data...
        </div>
      ) : !patient ? null : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <LiveTranscript />
            <CallHistoryTimeline patientId={patientId} />
          </div>

          <div>
            <CarePlanCard patient={patient} />
          </div>
        </div>
      )}
    </div>
  );
}
