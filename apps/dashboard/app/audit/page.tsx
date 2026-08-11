'use client';

import React, { useEffect, useState } from 'react';
import { getAudit, getPatientById, onEscalationNew, onEscalationAcknowledged, acknowledgeEscalationApi } from '../../lib/apiClient';
import { Escalation } from '@wellcall/shared-types';

export default function AuditPage() {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'escalated' | 'routine'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<Escalation | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    getAudit()
      .then(async (data) => {
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

  // Listen for live escalations
  useEffect(() => {
    const unsubscribe = onEscalationNew(async (newEsc) => {
      let patientName = newEsc.patientId;
      if (newEsc.patientId) {
        const p = await getPatientById(newEsc.patientId);
        if (p?.name) patientName = p.name;
      }
      setEscalations((prev) => [{ ...newEsc, patientName } as any, ...prev]);
    });
    return () => unsubscribe();
  }, []);

  // Listen for global escalation:acknowledged events
  useEffect(() => {
    const unsubscribe = onEscalationAcknowledged(({ id }) => {
      setEscalations((prev) =>
        prev.map((item) => (item.id === id ? { ...item, acknowledged: true } : item))
      );
      setSelectedRecord((prev) => (prev && prev.id === id ? { ...prev, acknowledged: true } : prev));
    });
    return () => unsubscribe();
  }, []);

  const handleAcknowledge = async (id: string) => {
    setEscalations((prev) =>
      prev.map((item) => (item.id === id ? { ...item, acknowledged: true } : item))
    );
    if (selectedRecord && selectedRecord.id === id) {
      setSelectedRecord((prev) => (prev ? { ...prev, acknowledged: true } : null));
    }
    await acknowledgeEscalationApi(id);
  };

  const filteredEscalations = escalations.filter((esc) => {
    const matchesFilter =
      filter === 'all'
        ? true
        : filter === 'escalated'
        ? !esc.acknowledged
        : esc.acknowledged;

    const query = searchQuery.toLowerCase();
    const patientName = ((esc as any).patientName || '').toLowerCase();
    const matchesSearch =
      !searchQuery ||
      esc.id.toLowerCase().includes(query) ||
      esc.callId.toLowerCase().includes(query) ||
      esc.reason.toLowerCase().includes(query) ||
      patientName.includes(query);

    return matchesFilter && matchesSearch;
  });

  return (
    <main className="max-w-[1440px] mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-slate-100 tracking-tight">Audit Log</h1>
        <p className="text-slate-400 text-sm mt-1">Compliance record of all patient calls &amp; clinical risk decisions</p>
      </div>

      {/* Control Bar (Glassmorphic) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        {/* Filter Pills */}
        <div className="flex bg-slate-950/80 rounded-lg p-1 border border-slate-800">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              filter === 'all' ? 'bg-slate-800 text-cyan-400 border border-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({escalations.length})
          </button>
          <button
            onClick={() => setFilter('escalated')}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              filter === 'escalated' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Escalated ({escalations.filter((e) => !e.acknowledged).length})
          </button>
          <button
            onClick={() => setFilter('routine')}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              filter === 'routine' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Acknowledged ({escalations.filter((e) => e.acknowledged).length})
          </button>
        </div>

        {/* Search Bar & Date Picker Stub */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Search Input */}
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search audit logs..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Static Date Picker Stub */}
          <input
            type="date"
            disabled
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-500 opacity-60 cursor-not-allowed hidden sm:block"
          />

          {/* Static PDF Export Button Stub */}
          <button
            onClick={() => console.log('[AuditPage] PDF export clicked (mock)')}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
          >
            📄 Export PDF
          </button>
        </div>
      </div>

      {/* Main Audit Table */}
      {loading ? (
        <div className="p-8 text-center text-slate-400 animate-pulse bg-slate-900/50 rounded-xl border border-slate-800">
          Loading compliance audit records...
        </div>
      ) : error ? (
        <div className="bg-rose-950/40 border border-rose-800/60 p-4 rounded-xl text-rose-200">
          ⚠️ {error}
        </div>
      ) : filteredEscalations.length === 0 ? (
        <div className="bg-slate-900/90 border border-slate-800 text-slate-400 rounded-xl p-8 text-center">
          No audit records found matching query.
        </div>
      ) : (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-4">Record ID</th>
                  <th className="p-4">Patient Name</th>
                  <th className="p-4">Call ID</th>
                  <th className="p-4">Clinical Rationale</th>
                  <th className="p-4">Timestamp</th>
                  <th className="p-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {filteredEscalations.map((esc) => (
                  <tr
                    key={esc.id}
                    onClick={() => setSelectedRecord(esc)}
                    className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                  >
                    <td className="p-4 font-mono text-cyan-400 font-medium">{esc.id}</td>
                    <td className="p-4 font-bold text-slate-100">{(esc as any).patientName || esc.patientId}</td>
                    <td className="p-4 text-slate-400 font-mono">{esc.callId}</td>
                    <td className="p-4 text-slate-300 max-w-md truncate">{esc.reason}</td>
                    <td className="p-4 text-slate-400">{new Date(esc.timestamp).toLocaleString()}</td>
                    <td className="p-4 text-right">
                      <button
                        disabled={esc.acknowledged}
                        onClick={(e) => { e.stopPropagation(); handleAcknowledge(esc.id); }}
                        className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                          esc.acknowledged
                            ? 'bg-slate-800 text-slate-300 border-slate-700 cursor-default'
                            : 'bg-rose-950 text-rose-300 border-rose-800 animate-pulse hover:bg-rose-900 cursor-pointer'
                        }`}
                      >
                        {esc.acknowledged ? '✓ Acknowledged' : '🚨 Click to Acknowledge'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Slide-over Inspection Drawer */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full p-6 space-y-6 overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-slate-100">Audit Record Details</h3>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-slate-400 hover:text-slate-200 p-1 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-300">
              <div>
                <span className="text-slate-400 block mb-1 uppercase font-semibold">Record ID</span>
                <span className="font-mono text-cyan-400 text-sm font-bold">{selectedRecord.id}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1 uppercase font-semibold">Patient</span>
                <span className="font-bold text-slate-100 text-sm">{(selectedRecord as any).patientName || selectedRecord.patientId}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1 uppercase font-semibold">Call ID</span>
                <span className="font-mono text-slate-300">{selectedRecord.callId}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1 uppercase font-semibold">AI Call Summary</span>
                <p className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-cyan-200 leading-relaxed font-medium">
                  {(selectedRecord as any).summary || selectedRecord.reason}
                </p>
              </div>
              <div>
                <span className="text-slate-400 block mb-1 uppercase font-semibold">Clinical Rationale</span>
                <p className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-rose-300 leading-relaxed font-medium">
                  {selectedRecord.reason}
                </p>
              </div>
              <div>
                <span className="text-slate-400 block mb-1 uppercase font-semibold">Timestamp</span>
                <span>{new Date(selectedRecord.timestamp).toLocaleString()}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 space-y-2">
              {!selectedRecord.acknowledged && (
                <button
                  onClick={() => handleAcknowledge(selectedRecord.id)}
                  className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg text-xs transition-colors"
                >
                  ✓ Acknowledge Escalation
                </button>
              )}
              {selectedRecord.acknowledged && (
                <div className="w-full text-center text-emerald-400 font-semibold text-xs py-2">
                  ✓ Acknowledged
                </div>
              )}
              <button
                onClick={() => setSelectedRecord(null)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 py-2 rounded-lg font-semibold text-xs"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
