import React from 'react';
import { TranscriptEntry } from '@wellcall/shared-types';

export interface CallHistoryTimelineProps {
  entries: TranscriptEntry[];
}

export const CallHistoryTimeline: React.FC<CallHistoryTimelineProps> = ({ entries }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-200">
      <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider mb-4">
        Call Event Audit Timeline
      </h3>

      <div className="relative border-l-2 border-slate-700 ml-3 space-y-4 pl-4 text-xs">
        {entries.length === 0 ? (
          <p className="text-slate-500 italic">No timeline entries recorded yet.</p>
        ) : (
          entries.map((item) => (
            <div key={item.id} className="relative">
              <div className="absolute -left-[21px] top-0.5 h-2.5 w-2.5 rounded-full bg-cyan-500 ring-4 ring-slate-900" />
              <div className="flex justify-between items-baseline mb-0.5">
                <span className="font-bold text-cyan-400 uppercase">{item.speaker}</span>
                <span className="text-[10px] text-slate-500">{new Date(item.timestamp).toLocaleTimeString()}</span>
              </div>
              <p className="text-slate-300 italic font-mono bg-slate-800 p-2 rounded">
                "{item.text}"
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CallHistoryTimeline;
