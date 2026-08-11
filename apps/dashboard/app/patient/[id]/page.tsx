'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import LiveTranscript from '../../../components/LiveTranscript';
import CarePlanCard from '../../../components/CarePlanCard';
import CallHistoryTimeline from '../../../components/CallHistoryTimeline';
import RiskFlagBanner from '../../../components/RiskFlagBanner';
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
    <main className="max-w-[1440px] mx-auto p-6 space-y-6">
      {/* Navigation Breadcrumb */}
      <div>
        <Link href="/" className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1">
          ← Back to Active Patients
        </Link>
      </div>

      {/* Patient Specific Risk Flag Banner */}
      <RiskFlagBanner patientId={patientId} />

      {error ? (
        <div className="bg-rose-950/40 border border-rose-800/60 p-4 rounded-xl text-rose-200">
          ⚠️ {error}
        </div>
      ) : loading ? (
        <div className="p-8 text-center text-slate-400 animate-pulse bg-slate-900/50 rounded-xl border border-slate-800">
          Loading patient profile...
        </div>
      ) : !patient ? null : (
        /* Frontend 1 Grid Layout (12-column grid: 4 cols left sidebar, 8 cols main content) */
        <div className="grid grid-cols-12 gap-6 items-start">
          {/* Left Column: CarePlanCard */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            <CarePlanCard patient={patient} />
          </div>

          {/* Right Column: LiveTranscript & CallHistoryTimeline */}
          <div className="col-span-12 lg:col-span-8 space-y-6">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow space-y-3">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                🎙️ Live Call Communication
              </h3>
              <LiveTranscript patientId={patientId} />
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow space-y-3">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                📜 Cross-Call History Timeline
              </h3>
              <CallHistoryTimeline patientId={patientId} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
