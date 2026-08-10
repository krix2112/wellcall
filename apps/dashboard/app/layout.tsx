import React from 'react';
import './globals.css';

export const metadata = {
  title: 'Wellcall Nurse Dashboard',
  description: 'Proactive post-discharge patient voice check-in gateway dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ backgroundColor: '#090d16', color: '#f8fafc', minHeight: '100vh', margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <header style={{ borderBottom: '1px solid #1e293b', backgroundColor: '#0f172a', padding: '16px 24px', position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '24px' }}>📞</span>
              <div>
                <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#ffffff' }}>Wellcall</h1>
                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>Post-Discharge Patient Voice Check-in Gateway</p>
              </div>
            </div>

            <nav style={{ display: 'flex', gap: '24px', fontSize: '14px', fontWeight: 500 }}>
              <a href="/" style={{ color: '#38bdf8' }}>Active Patients</a>
              <a href="/audit" style={{ color: '#94a3b8' }}>Audit Report</a>
            </nav>
          </div>
        </header>

        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>{children}</main>
      </body>
    </html>
  );
}
