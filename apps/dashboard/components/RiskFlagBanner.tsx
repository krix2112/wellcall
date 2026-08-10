'use client';

import React, { useEffect, useState } from 'react';
import { Escalation } from '@wellcall/shared-types';
import { onEscalationNew, getAudit, getPatientById } from '../lib/apiClient';

export interface RiskFlagBannerProps {
  patientId?: string;
  initialEscalations?: Escalation[];
}

export const RiskFlagBanner: React.FC<RiskFlagBannerProps> = ({
  patientId,
  initialEscalations = [],
}) => {
  const [escalations, setEscalations] = useState<Escalation[]>(initialEscalations);

  // Load existing escalations from audit on mount
  useEffect(() => {
    getAudit()
      .then(async (data) => {
        if (!data.escalations || data.escalations.length === 0) return;
        // Enrich with patient names
        const enriched = await Promise.all(
          data.escalations.map(async (esc) => {
            if (esc.patientId) {
              const p = await getPatientById(esc.patientId);
              return { ...esc, patientName: p?.name || esc.patientId } as any;
            }
            return esc;
          })
        );
        setEscalations((prev) => {
          const combined = [...enriched, ...prev];
          // dedupe by id
          const seen = new Set<string>();
          return combined.filter((e) => {
            if (seen.has(e.id)) return false;
            seen.add(e.id);
            return true;
          });
        });
      })
      .catch((err) => console.error('[RiskFlagBanner] Failed to load audit:', err));
  }, []);

  useEffect(() => {
    const unsubscribe = onEscalationNew((newEscalation: Escalation) => {
      console.log('[RiskFlagBanner] Received escalation:new event:', newEscalation);

      // Filter by patientId if specified
      if (patientId && newEscalation.patientId !== patientId) {
        return;
      }

      setEscalations((prev) => {
        // Prevent duplicates by ID
        if (prev.some((e) => e.id === newEscalation.id)) {
          return prev;
        }
        return [newEscalation, ...prev];
      });
    });

    return () => {
      unsubscribe();
    };
  }, [patientId]);

  const handleAcknowledge = (id: string) => {
    setEscalations((prev) =>
      prev.map((item) => (item.id === id ? { ...item, acknowledged: true } : item))
    );
  };

  if (escalations.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', marginBottom: '20px' }}>
      {escalations.map((item) => {
        const isAck = item.acknowledged;

        return (
          <div
            key={item.id}
            style={{
              width: '100%',
              padding: '16px 20px',
              borderRadius: '12px',
              backgroundColor: isAck ? 'rgba(15, 23, 42, 0.95)' : 'rgba(136, 19, 55, 0.95)',
              border: isAck ? '1px solid #334155' : '2px solid #e11d48',
              boxShadow: isAck
                ? 'none'
                : '0 0 25px rgba(225, 29, 72, 0.35), 0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              color: '#fff',
              transition: 'all 0.3s ease-in-out',
              fontFamily: 'sans-serif',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div
                  style={{
                    fontSize: '24px',
                    lineHeight: '1',
                    animation: isAck ? 'none' : 'pulse 1.5s infinite ease-in-out',
                  }}
                >
                  {isAck ? '✓' : '🚨'}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontWeight: 'bold',
                        fontSize: '15px',
                        letterSpacing: '0.5px',
                        color: isAck ? '#94a3b8' : '#fecdd3',
                      }}
                    >
                      {isAck ? 'NURSE ESCALATION ACKNOWLEDGED' : 'HIGH-RISK ESCALATION TRIGGERED'}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        backgroundColor: isAck ? '#1e293b' : '#9f1239',
                        color: isAck ? '#cbd5e1' : '#ffe4e6',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        border: isAck ? '1px solid #475569' : '1px solid #f43f5e',
                      }}
                    >
                      Call: {item.callId}
                    </span>
                  </div>

                  <p
                    style={{
                      margin: '8px 0 6px 0',
                      fontSize: '14px',
                      color: isAck ? '#cbd5e1' : '#ffffff',
                      fontWeight: 500,
                      lineHeight: '1.4',
                    }}
                  >
                    {item.reason}
                  </p>

                  <div style={{ fontSize: '11px', color: isAck ? '#64748b' : '#fda4af' }}>
                    Escalated at: {new Date(item.timestamp).toLocaleString()} | Patient: {item.patientId}
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleAcknowledge(item.id)}
                disabled={isAck}
                style={{
                  backgroundColor: isAck ? '#1e293b' : '#e11d48',
                  color: isAck ? '#94a3b8' : '#ffffff',
                  border: isAck ? '1px solid #334155' : '1px solid #f43f5e',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: isAck ? 'default' : 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'background-color 0.2s ease',
                }}
              >
                {isAck ? '✓ Acknowledged' : 'Acknowledge'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default RiskFlagBanner;
