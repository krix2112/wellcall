import React from 'react';

export const metadata = {
  title: 'Wellcall Nurse Dashboard',
  description: 'Proactive post-discharge patient voice check-in gateway dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen font-sans antialiased">
        <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📞</span>
              <div>
                <h1 className="font-bold text-xl tracking-tight text-white">Wellcall</h1>
                <p className="text-xs text-slate-400">Post-Discharge Patient Voice Check-in Gateway</p>
              </div>
            </div>

            <nav className="flex items-center gap-6 text-sm font-medium text-slate-300">
              <a href="/" className="hover:text-cyan-400 transition-colors">Active Patients</a>
              <a href="/audit" className="hover:text-cyan-400 transition-colors">Audit Report</a>
            </nav>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
