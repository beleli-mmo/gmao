import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TicketCreateForm } from './components/TicketCreateForm';
import { QrScanner } from './components/QrScanner';
import { MyTicketsList } from './components/MyTicketsList';
import { setSession as setSyncSession, pullReference, onAuthExpiredCallback } from './db/pouch';
import type { ResolvedEquipment } from './lib/qr';
import './app.css';

const API = (import.meta.env.VITE_API_URL as string)?.replace(/\/$/, '') || '';
type Session = { username: string; token: string; fullName: string };
type Screen = { name: 'home' } | { name: 'scan' } | { name: 'ticket'; qrPayload?: string; equipmentId?: string } | { name: 'history' };

function Login({ onDone }: { onDone: (s: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) throw new Error('Identifiants invalides');
      const d = await r.json();
      const s: Session = { username: d.user.id, token: d.accessToken, fullName: d.user.fullName };
      localStorage.setItem('gmao.session', JSON.stringify(s));
      onDone(s);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-home">
      <h1>GMAO Terrain</h1>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input className="app-cta" style={{ fontWeight: 400 }} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="app-cta" style={{ fontWeight: 400 }} type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <p style={{ color: '#b3140f', margin: 0 }}>{err}</p>}
        <button className="app-cta app-cta--primary" disabled={loading}>{loading ? 'Connexion…' : 'Se connecter'}</button>
      </form>
    </main>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  const activate = useCallback((s: Session) => {
    setSession(s);
    setSyncSession({ username: s.username, token: s.token });
    pullReference().catch(() => {});
  }, []);

  const logout = useCallback(() => {
    setSyncSession(null);
    localStorage.removeItem('gmao.session');
    setSession(null);
    setScreen({ name: 'home' });
  }, []);

  useEffect(() => {
    onAuthExpiredCallback(() => {
      setSession(null);
      setScreen({ name: 'home' });
    });
    const raw = localStorage.getItem('gmao.session');
    if (raw) {
      try {
        activate(JSON.parse(raw) as Session);
      } catch {
        localStorage.removeItem('gmao.session');
      }
    }
  }, [activate]);

  if (!session) return <Login onDone={activate} />;

  if (screen.name === 'scan') {
    return (
      <QrScanner
        onCancel={() => setScreen({ name: 'home' })}
        onIdentified={({ qrPayload, equipment }: { qrPayload: string; equipment: ResolvedEquipment | null }) =>
          setScreen({ name: 'ticket', qrPayload, equipmentId: equipment?.id })
        }
      />
    );
  }

  if (screen.name === 'history') {
    return (
      <main>
        <button className="app-back" onClick={() => setScreen({ name: 'home' })}>← Retour</button>
        <h1 style={{ padding: '8px 16px 0', fontSize: 20 }}>Mes demandes</h1>
        <MyTicketsList />
      </main>
    );
  }

  if (screen.name === 'ticket') {
    return (
      <main>
        <button className="app-back" onClick={() => setScreen({ name: 'home' })}>← Retour</button>
        <h1 style={{ padding: '8px 16px 0', fontSize: 20 }}>Nouvelle demande d’intervention</h1>
        <TicketCreateForm
          reporterId={session.username}
          scannedQrPayload={screen.qrPayload}
          preselectedEquipmentId={screen.equipmentId}
          onCreated={() => setScreen({ name: 'home' })}
        />
      </main>
    );
  }

  return (
    <main className="app-home">
      <h1>GMAO Terrain</h1>
      <p className="muted" style={{ marginTop: -8 }}>{session.fullName}</p>
      <button className="app-cta app-cta--primary" onClick={() => setScreen({ name: 'scan' })}>📷 Scanner un actif</button>
      <button className="app-cta" onClick={() => setScreen({ name: 'ticket' })}>✏️ Créer une demande</button>
      <button className="app-cta" onClick={() => setScreen({ name: 'history' })}>📋 Mes demandes</button>
      <button className="app-cta" style={{ borderColor: 'transparent', color: '#1769ff' }} onClick={logout}>Se déconnecter</button>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
