import React, { useEffect, useState } from 'react';
import { TranscriptEntry } from '@wellcall/shared-types';
import { apiClient } from '../lib/apiClient';

export interface LiveTranscriptProps {
  initialEntries?: TranscriptEntry[];
}

export const LiveTranscript: React.FC<LiveTranscriptProps> = ({ initialEntries = [] }) => {
  const [entries, setEntries] = useState<TranscriptEntry[]>(initialEntries);

  useEffect(() => {
    const socket = apiClient.getSocket();

    const handleNewTranscript = (entry: TranscriptEntry) => {
      setEntries((prev) => [...prev, entry]);
    };

    socket.on('transcript:new', handleNewTranscript);

    return () => {
      socket.off('transcript:new', handleNewTranscript);
    };
  }, []);

  return (
    <div className="border border-slate-800 rounded-xl p-4 bg-slate-900 text-white font-mono text-sm shadow">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <h3 className="font-semibold text-slate-200 uppercase tracking-wider text-xs">
          Live Call Audio Transcript
        </h3>
        <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-sans">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
          SOCKET.IO CONNECTED
        </span>
      </div>

      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
        {entries.length === 0 ? (
          <p className="text-slate-500 italic text-center py-6 font-sans text-xs">
            Listening for transcript:new socket events...
          </p>
        ) : (
          entries.map((item) => (
            <div
              key={item.id}
              className={`p-2.5 rounded text-xs ${
                item.speaker === 'agent'
                  ? 'bg-slate-800 border-l-4 border-cyan-500 text-slate-200'
                  : 'bg-slate-800/60 border-l-4 border-amber-500 text-amber-200'
              }`}
            >
              <div className="text-[10px] text-slate-400 mb-1 flex justify-between">
                <span className="font-bold">{item.speaker === 'agent' ? 'Wellcall Agent' : 'Patient'}</span>
                <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
              </div>
              <p>{item.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LiveTranscript;
