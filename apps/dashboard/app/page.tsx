'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Patient } from '@wellcall/shared-types';
import { getPatients, getCallsForPatient } from '../lib/apiClient';
import RiskFlagBanner from '../components/RiskFlagBanner';
import LiveTranscript from '../components/LiveTranscript';

export default function HomePage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'needs_attention' | 'routine'>('all');
  const [callStats, setCallStats] = useState<Record<string, { lastCall: string; isEscalated: boolean }>>({});

  useEffect(() => {
    getPatients()
      .then(async (data) => {
        setPatients(data);
        setLoading(false);

        const statsMap: Record<string, { lastCall: string; isEscalated: boolean }> = {};
        for (const p of data) {
          const calls = await getCallsForPatient(p.id);
          const hasEscalated = calls.some((c) => c.outcome === 'escalated');
          const lastCallTime = calls[0]?.startedAt
            ? new Date(calls[0].startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'No calls yet';
          statsMap[p.id] = { lastCall: lastCallTime, isEscalated: hasEscalated };
        }
        setCallStats(statsMap);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredPatients = patients.filter((p) => {
    const isEscalated = callStats[p.id]?.isEscalated;
    if (filter === 'needs_attention') return isEscalated;
    if (filter === 'routine') return !isEscalated;
    return true;
  });

  return (
    <main className="max-w-[1440px] mx-auto p-6 space-y-6">
      {/* Risk Escalation Banner */}
      <RiskFlagBanner />

      {/* Header & Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-100 tracking-tight">Patients</h1>
          <p className="text-slate-400 text-sm mt-1">{patients.length} active post-discharge follow-ups</p>
        </div>

        {/* Segmented Filter */}
        <div className="inline-flex bg-slate-900/80 p-1 rounded-full border border-slate-800 shadow-sm">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === 'all'
                ? 'bg-slate-800 text-cyan-400 border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({patients.length})
          </button>
          <button
            onClick={() => setFilter('needs_attention')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === 'needs_attention'
                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Needs Attention ({Object.values(callStats).filter((s) => s.isEscalated).length})
          </button>
          <button
            onClick={() => setFilter('routine')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === 'routine'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Routine ({Object.values(callStats).filter((s) => !s.isEscalated).length})
          </button>
        </div>
      </div>

      {/* Patient Directory List Table */}
      {loading ? (
        <div className="p-8 text-center text-slate-400 animate-pulse bg-slate-900/50 rounded-xl border border-slate-800">
          Loading patient directory...
        </div>
      ) : (
        <div className="space-y-3">
          {/* Table Headers */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <div className="col-span-3">Patient</div>
            <div className="col-span-3">Condition</div>
            <div className="col-span-2">Last Call</div>
            <div className="col-span-2">Next Follow-up</div>
            <div className="col-span-2 text-right">Status</div>
          </div>

          {/* Patient Rows */}
          {filteredPatients.map((patient) => {
            const stats = callStats[patient.id] || { lastCall: 'Pending', isEscalated: false };
            const initials = patient.name.split(' ').map((n) => n[0]).join('').substring(0, 2);

            return (
              <Link key={patient.id} href={`/patient/${patient.id}`}>
                <div
                  className={`rounded-xl p-4 md:px-6 md:py-4 flex flex-col md:grid md:grid-cols-12 gap-4 items-center relative overflow-hidden transition-all hover:-translate-y-0.5 cursor-pointer bg-slate-900/90 border ${
                    stats.isEscalated
                      ? 'border-rose-800/80 shadow-rose-900/20'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {stats.isEscalated && <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-rose-600" />}

                  {/* Patient Info */}
                  <div className="col-span-3 flex items-center gap-3 w-full pl-2">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                        stats.isEscalated
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                      }`}
                    >
                      {initials}
                    </div>
                    <div>
                      <div className="font-bold text-slate-100 text-sm">{patient.name}</div>
                      <div className="text-xs text-slate-400">#{patient.id}</div>
                    </div>
                  </div>

                  {/* Condition */}
                  <div className="col-span-3 text-sm text-slate-300">{patient.condition}</div>

                  {/* Last Call */}
                  <div className="col-span-2 text-xs text-slate-400">{stats.lastCall}</div>

                  {/* Next Follow-up */}
                  <div className="col-span-2 text-xs text-emerald-400 font-medium">{patient.followUpDate}</div>

                  {/* Status Badge */}
                  <div className="col-span-2 text-right">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${
                        stats.isEscalated
                          ? 'bg-rose-950/80 text-rose-300 border-rose-800 animate-pulse'
                          : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                      }`}
                    >
                      {stats.isEscalated ? '🚨 Escalated' : '✓ Routine'}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Live Transcript Stream */}
      <div className="pt-4">
        <h2 className="text-lg font-bold text-slate-200 mb-3">Live Call Transcript Stream</h2>
        <LiveTranscript />
      </div>
    </main>
  );
}
