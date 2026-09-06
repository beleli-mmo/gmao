'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSession, setSession } from '@/lib/api';

const NAV = [
  { href: '/', label: 'Vue d’ensemble' },
  { href: '/executions', label: 'Exécutions' },
  { href: '/planning', label: 'Planning' },
  { href: '/rapports', label: 'Rapports' },
  { href: '/analytique', label: 'Analytique' },
];
const ALLOWED = ['DIRECTION', 'ADMIN'];

export default function ExecLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    const s = getSession();
    if (!s || !ALLOWED.includes(s.user.role)) {
      router.replace('/login');
    } else {
      setName(s.user.fullName);
      setReady(true);
    }
  }, [router]);

  if (!ready) return null;

  return (
    <>
      <header className="top">
        <div className="top-in">
          <div className="brand">
            Belel <span>PDG</span> GMAO
            <small>Maintenance &amp; exploitation — direction</small>
          </div>
          <div className="top-user">
            <b>{name}</b>
            <button
              className="btn-ghost no-print"
              style={{ marginTop: 4, fontSize: 11, padding: '3px 8px' }}
              onClick={() => { setSession(null); router.replace('/login'); }}
            >
              Se déconnecter
            </button>
          </div>
        </div>
      </header>
      <nav className="nav">
        <div className="nav-in">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={pathname === n.href ? 'on' : ''}>{n.label}</Link>
          ))}
        </div>
      </nav>
      <main>{children}</main>
    </>
  );
}
