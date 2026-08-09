import React, { useEffect, useState } from 'react';
import { Escalation } from '@wellcall/shared-types';
import { apiClient } from '../lib/apiClient';

export interface RiskFlagBannerProps {
  initialEscalation?: Escalation | null;
}

export const RiskFlagBanner: React.FC<RiskFlagBannerProps> = ({ initialEscalation = null }) => {
  const [activeEscalation, setActiveEscalation] = useState<Escalation | null>(initialEscalation);

  useEffect(() => {
    const socket = apiClient.getSocket();

    const handleNewEscalation = (escalation: Escalation) => {
      setActiveEscalation(escalation);
    };

    socket.on('escalation:new', handleNewEscalation);

    return () => {
      socket.off('escalation:new', handleNewEscalation);
    };
  }, []);

  if (!activeEscalation) return null;

  return (
    <div className="w-full p-4 rounded-xl shadow-lg border border-rose-600 bg-rose-950/90 text-rose-100 animate-pulse transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl mt-0.5">🚨</div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg">
                NURSE ESCALATION REQUIRED: {activeEscalation.patientName}
              </h3>
              <span className="px-2 py-0.5 rounded text-xs uppercase font-extrabold bg-rose-600 text-white">
                {activeEscalation.riskTier} RISK
              </span>
            </div>
            <p className="mt-1 text-sm opacity-90">{activeEscalation.reason}</p>
            <span className="text-xs opacity-60 mt-1 block">
              Triggered: {new Date(activeEscalation.timestamp).toLocaleString()}
            </span>
          </div>
        </div>

        <button
          onClick={() => setActiveEscalation(null)}
          className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors"
        >
          Acknowledge
        </button>
      </div>
    </div>
  );
};

export default RiskFlagBanner;
