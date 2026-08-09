import React from 'react';
import RiskFlagBanner from '../components/RiskFlagBanner';

export default function HomePage() {
  const mockPatients = [
    { id: 'patient-01', name: 'John Doe', condition: 'Post-Laparoscopic Cholecystectomy', status: 'Completed', risk: 'low' },
    { id: 'patient-02', name: 'Jane Smith', condition: 'Post-CABG Heart Surgery', status: 'ESCALATED', risk: 'critical' },
    { id: 'patient-03', name: 'Robert Johnson', condition: 'CHF Discharge', status: 'Scheduled', risk: 'high' },
    { id: 'patient-04', name: 'Emily Davis', condition: 'Total Hip Arthroplasty', status: 'Completed', risk: 'low' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Active Calls & Patient Roster</h2>
        <p className="text-sm text-slate-400">
          Connected directly to Gateway REST API (`/patients`) and Socket.io (`transcript:new`, `escalation:new`).
        </p>
      </div>

      <RiskFlagBanner
        initialEscalation={{
          id: 'esc-01',
          callId: 'call-101',
          patientId: 'patient-02',
          patientName: 'Jane Smith',
          timestamp: new Date().toISOString(),
          riskTier: 'critical',
          reason: 'Patient reported chest tightness matching post-CABG cardiac red flag.',
          status: 'pending',
        }}
      />

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
        <div className="p-4 border-b border-slate-800 font-semibold text-slate-300 flex justify-between items-center text-sm">
          <span>Patient Check-in Roster</span>
          <span className="text-xs bg-slate-800 px-2.5 py-1 rounded text-slate-400">4 Patients</span>
        </div>

        <div className="divide-y divide-slate-800">
          {mockPatients.map((pt) => (
            <div key={pt.id} className="p-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors">
              <div>
                <div className="flex items-center gap-3">
                  <a href={`/patient/${pt.id}`} className="font-bold text-cyan-400 hover:underline">
                    {pt.name}
                  </a>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                      pt.risk === 'critical' || pt.risk === 'high'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    }`}
                  >
                    {pt.risk} RISK
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{pt.condition}</p>
              </div>

              <a
                href={`/patient/${pt.id}`}
                className="bg-slate-800 hover:bg-slate-700 text-xs px-3 py-1.5 rounded font-medium text-slate-200 transition-colors"
              >
                View Patient Details
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
