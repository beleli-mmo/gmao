'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, setSession } from '@/lib/api';

const ALLOWED = ['DIRECTION', 'ADMIN'];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const s = await login(email.trim(), password);
      if (!ALLOWED.includes(s.user.role)) {
        setErr('Ce portail est réservé à la direction.');
        return;
      }
      setSession(s);
      router.replace('/');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit}>
        <h1>Belel <span>PDG</span> GMAO</h1>
        <p>Tableau de bord de direction — consultation</p>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <p className="err">{err}</p>}
        <button disabled={loading}>{loading ? 'Connexion…' : 'Se connecter'}</button>
      </form>
    </div>
  );
}
