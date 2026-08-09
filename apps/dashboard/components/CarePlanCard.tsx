import React from 'react';
import { Patient } from '@wellcall/shared-types';

export interface CarePlanCardProps {
  patient: Patient;
}

export const CarePlanCard: React.FC<CarePlanCardProps> = ({ patient }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-xl p-5 shadow space-y-4">
      <div className="border-b border-slate-800 pb-3 flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-cyan-400">{patient.name}</h2>
          <p className="text-xs text-slate-400">ID: {patient.id}</p>
        </div>
        <span className="bg-cyan-950 text-cyan-300 border border-cyan-800 px-3 py-1 rounded-full text-xs font-medium">
          {patient.condition}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-xs">
        <div>
          <span className="text-slate-400 block">Discharge Date</span>
          <span className="font-semibold">{patient.dischargeDate}</span>
        </div>
        <div>
          <span className="text-slate-400 block">Follow-up Date</span>
          <span className="font-semibold text-emerald-400">{patient.followUpDate}</span>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
          Prescribed Medications
        </h4>
        <ul className="space-y-1 text-xs">
          {patient.medications.map((med, idx) => (
            <li key={idx} className="bg-slate-800/80 p-2 rounded flex justify-between border border-slate-800">
              <span className="font-semibold text-slate-200">{med.name} ({med.dosage})</span>
              <span className="text-slate-400">{med.frequency}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-2">
          Red-Flag Triggers ({patient.redFlags.length})
        </h4>
        <div className="space-y-1.5 text-xs">
          {patient.redFlags.map((flag) => (
            <div key={flag.id} className="bg-rose-950/30 border border-rose-800/40 p-2 rounded text-rose-200">
              <div className="font-bold flex justify-between">
                <span>{flag.category.toUpperCase()}</span>
                <span className="uppercase text-[10px] bg-rose-900 px-1.5 py-0.5 rounded">{flag.severity}</span>
              </div>
              <p className="text-[11px] opacity-90 mt-0.5">{flag.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CarePlanCard;
