import React from 'react';

export default function AuditPage() {
  const escalations = [
    {
      id: 'esc-01',
      callId: 'call-101',
      patientId: 'patient-02',
      patientName: 'Jane Smith',
      timestamp: '2026-08-09T15:30:00.000Z',
      riskTier: 'critical',
      reason: 'Patient reported chest tightness matching post-CABG cardiac red flag.',
      status: 'pending',
    },
    {
      id: 'esc-02',
      callId: 'call-098',
      patientId: 'patient-03',
      patientName: 'Robert Johnson',
      timestamp: '2026-08-09T14:15:00.000Z',
      riskTier: 'high',
      reason: 'Patient reported 3lb overnight weight gain with bilateral ankle edema.',
      status: 'acknowledged',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Call Audit & Nurse Escalation Ledger</h2>
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
              <th className="p-3">Risk Tier</th>
              <th className="p-3">Auditable Reason</th>
              <th className="p-3">Timestamp</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {escalations.map((esc) => (
              <tr key={esc.id} className="hover:bg-slate-800/40">
                <td className="p-3 font-mono text-cyan-400">{esc.id}</td>
                <td className="p-3 font-bold">{esc.patientName}</td>
                <td className="p-3">
                  <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-rose-950 text-rose-300 border border-rose-800">
                    {esc.riskTier}
                  </span>
                </td>
                <td className="p-3 max-w-md">{esc.reason}</td>
                <td className="p-3 text-slate-400">{new Date(esc.timestamp).toLocaleString()}</td>
                <td className="p-3">
                  <span className="px-2 py-0.5 rounded text-[10px] uppercase font-semibold bg-slate-800 text-slate-300">
                    {esc.status}
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
