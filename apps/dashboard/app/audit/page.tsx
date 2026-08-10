'use client';

import React, { useEffect, useState } from 'react';
import { getAudit, getPatientById } from '../../lib/apiClient';
import { Escalation } from '@wellcall/shared-types';

export default function AuditPage() {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    getAudit()
      .then(async (data) => {
        // Enrich escalations with patient name for display
        const enriched = await Promise.all(
          data.escalations.map(async (esc) => {
            if (esc.patientId) {
              const patient = await getPatientById(esc.patientId);
              return { ...esc, patientName: patient?.name || esc.patientId };
            }
            return { ...esc, patientName: 'Unknown' };
          })
        );
        setEscalations(enriched);
      })
      .catch(() => {
        setError('Failed to load audit data.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Call Audit & Nurse Escalation Ledger</h2>
          <p className="text-sm text-slate-400">
            Auditable table of call sessions, in-process extraction decisions, and nurse transfer events.
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-400 animate-pulse">
          Loading audit records...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Call Audit & Nurse Escalation Ledger</h2>
          <p className="text-sm text-slate-400">
            Auditable table of call sessions, in-process extraction decisions, and nurse transfer events.
          </p>
        </div>
        <div className="bg-rose-950/40 border border-rose-800/60 p-4 rounded-lg text-rose-200">
          {error}
        </div>
      </div>
    );
  }

  if (escalations.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Call Audit & Nurse Escalation Ledger</h2>
          <p className="text-sm text-slate-400">
            Auditable table of call sessions, in-process extraction decisions, and nurse transfer events.
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 text-slate-400 rounded-xl p-5 shadow">
          No escalation records yet. Run a demo scenario or start a live voice check-in to generate audit records.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Call Audit &amp; Nurse Escalation Ledger</h2>
        <p className="text-sm text-slate-400">
          Auditable table of call sessions, in-process extraction decisions, and nurse transfer events.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-800 text-slate-300 uppercase font-semibold border-b border-slate-700">
            <tr>
              <th className="p-3">Escalation ID</th>
              <th className="p-3">Patient Name</th>
              <th className="p-3">Call ID</th>
              <th className="p-3">Auditable Reason</th>
              <th className="p-3">Timestamp</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {escalations.map((esc) => (
              <tr key={esc.id} className="hover:bg-slate-800/40">
                <td className="p-3 font-mono text-cyan-400">{esc.id}</td>
                <td className="p-3 font-bold">{(esc as any).patientName || esc.patientId}</td>
                <td className="p-3 text-slate-400">{esc.callId}</td>
                <td className="p-3 max-w-md">{esc.reason}</td>
                <td className="p-3 text-slate-400">{new Date(esc.timestamp).toLocaleString()}</td>
                <td className="p-3">
                  <span className="px-2 py-0.5 rounded text-[10px] uppercase font-semibold bg-slate-800 text-slate-300">
                    {esc.acknowledged ? 'Acknowledged' : 'Pending'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
