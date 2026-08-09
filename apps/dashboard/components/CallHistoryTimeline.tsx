'use client';

import React, { useEffect, useState } from 'react';
import { EnrichedCallSession, getCallsForPatient } from '../lib/apiClient';

export interface CallHistoryTimelineProps {
  patientId: string;
}

export const CallHistoryTimeline: React.FC<CallHistoryTimelineProps> = ({ patientId }) => {
  const [calls, setCalls] = useState<EnrichedCallSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getCallsForPatient(patientId)
      .then((data) => {
        setCalls(data);
      })
      .catch(() => {
        setError('Failed loading patient call history timeline.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [patientId]);

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-400 animate-pulse">
        Loading call history timeline...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-900 border border-rose-900 rounded-xl p-5 text-rose-300">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow space-y-4">
      <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
        <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
          📜 Cross-Call Memory Timeline
        </h3>
        <span className="text-xs text-slate-400 font-mono">
          Patient: {patientId} ({calls.length} calls)
        </span>
      </div>

      {calls.length === 0 ? (
        <div className="p-6 text-center text-slate-400 bg-slate-800/40 rounded-lg border border-slate-800 text-xs italic">
          No previous call history recorded for this patient yet.
        </div>
      ) : (
        <div className="relative border-l-2 border-slate-700 ml-4 space-y-6 pl-6 text-xs pt-1 pb-1">
          {calls.map((call) => {
            const isEscalated = call.outcome === 'escalated';

            return (
              <div key={call.id} className="relative group">
                {/* Vertical Timeline Node Marker */}
                <div
                  className={`absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full ring-4 ring-slate-900 transition-all ${
                    isEscalated ? 'bg-rose-500 shadow-[0_0_10px_#f43f5e]' : 'bg-emerald-500'
                  }`}
                />

                <div className="bg-slate-800/70 border border-slate-700/80 p-3.5 rounded-lg space-y-2">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">Call ID: {call.id}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider border ${
                          isEscalated
                            ? 'bg-rose-950 text-rose-300 border-rose-800'
                            : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                        }`}
                      >
                        {isEscalated ? '🚨 Escalated' : '✓ Routine Log'}
                      </span>
                    </div>

                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(call.startedAt).toLocaleString()}
                    </span>
                  </div>

                  {isEscalated && call.escalationReason && (
                    <div className="bg-rose-950/40 border border-rose-800/50 p-2 rounded text-rose-200 text-[11px]">
                      <span className="font-semibold block mb-0.5 text-rose-300">Escalation Rationale:</span>
                      {call.escalationReason}
                    </div>
                  )}

                  <div className="flex justify-between text-[11px] text-slate-400 border-t border-slate-700/50 pt-2 mt-1">
                    <span>Status: <strong className="text-slate-300 capitalize">{call.status}</strong></span>
                    {call.endedAt && (
                      <span>Duration: {Math.round((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000)}s</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CallHistoryTimeline;
