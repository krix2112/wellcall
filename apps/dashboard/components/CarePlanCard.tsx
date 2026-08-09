'use client';

import React, { useEffect, useState } from 'react';
import { Patient } from '@wellcall/shared-types';
import { getPatientById } from '../lib/apiClient';

export interface CarePlanCardProps {
  patientId?: string;
  patient?: Patient;
}

export const CarePlanCard: React.FC<CarePlanCardProps> = ({ patientId, patient: initialPatient }) => {
  const [data, setData] = useState<Patient | null>(initialPatient || null);
  const [loading, setLoading] = useState<boolean>(!initialPatient && !!patientId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialPatient) {
      setData(initialPatient);
      return;
    }

    if (patientId) {
      setLoading(true);
      setError(null);
      getPatientById(patientId)
        .then((fetched) => {
          if (fetched) {
            setData(fetched);
          } else {
            setError(`Patient care plan "${patientId}" not found.`);
          }
        })
        .catch(() => {
          setError('Failed to load patient care plan.');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [patientId, initialPatient]);

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 text-slate-400 rounded-xl p-5 shadow animate-pulse">
        Loading patient care plan...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-slate-900 border border-rose-900 text-rose-300 rounded-xl p-5 shadow">
        {error || 'No patient data available.'}
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-xl p-5 shadow space-y-4">
      <div className="border-b border-slate-800 pb-3 flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-cyan-400">{data.name}</h2>
          <p className="text-xs text-slate-400">ID: {data.id}</p>
        </div>
        <span className="bg-cyan-950 text-cyan-300 border border-cyan-800 px-3 py-1 rounded-full text-xs font-medium">
          {data.condition}
        </span>
      </div>

      <div className="text-xs">
        <span className="text-slate-400 block">Follow-up Date</span>
        <span className="font-semibold text-emerald-400">{data.followUpDate}</span>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
          Prescribed Medications
        </h4>
        <ul className="space-y-1 text-xs">
          {data.medications.map((med, idx) => (
            <li key={idx} className="bg-slate-800/80 p-2 rounded flex justify-between border border-slate-800">
              <span className="font-semibold text-slate-200">
                {med.name} ({med.dosage})
              </span>
              <span className="text-slate-400">{med.frequency}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-slate-800 pt-3">
        <h4 className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-2">
          🚨 Red-Flag Triggers ({data.redFlagSymptoms.length})
        </h4>
        <div className="space-y-1.5 text-xs">
          {data.redFlagSymptoms.map((symptom, idx) => (
            <div key={idx} className="bg-rose-950/40 border border-rose-800/60 p-2.5 rounded-lg text-rose-200">
              <p className="text-[12px] font-medium opacity-95">{symptom}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CarePlanCard;
