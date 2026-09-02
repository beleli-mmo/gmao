'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { login } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('parc@gmao.local');
  const [password, setPassword] = useState('gmao1234');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <form onSubmit={onSubmit}>
        <h1>GMAO BTP</h1>
        <p className="muted">Administration du parc & de la maintenance</p>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" required />
        {err && <p style={{ color: 'var(--tone-critical)', margin: 0 }}>{err}</p>}
        <button className="btn" disabled={loading}>{loading ? 'Connexion…' : 'Se connecter'}</button>
      </form>
    </div>
  );
}
