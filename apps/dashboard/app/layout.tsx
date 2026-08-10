import React from 'react';
import Link from 'next/link';
import './globals.css';

export const metadata = {
  title: 'WellCall Clinical Dashboard',
  description: 'Proactive post-discharge patient voice check-in gateway dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen font-sans antialiased">
        <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 py-4 sticky top-0 z-50 shadow-sm">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-800 flex items-center justify-center text-xl shadow-sm group-hover:border-cyan-500 transition-colors">
                🩺
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-100 tracking-tight">WellCall</h1>
                <p className="text-xs text-slate-400">Clinical Post-Discharge Intelligence Platform</p>
              </div>
            </Link>

            <nav className="flex items-center gap-6 text-xs font-semibold">
              <Link href="/" className="text-cyan-400 hover:text-cyan-300 transition-colors">Active Patients</Link>
              <Link href="/mic" className="text-emerald-400 hover:text-emerald-300 transition-colors">🎙️ Live Check-in</Link>
              <Link href="/audit" className="text-slate-300 hover:text-white transition-colors">Audit Ledger</Link>
            </nav>
          </div>
        </header>

        {children}
      </body>
    </html>
  );
}
