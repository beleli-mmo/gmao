'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { currentSession, logout } from '@/lib/auth';

const NAV = [
  { href: '/dashboard', label: 'Tableau de bord', icon: '▦' },
  { href: '/tickets', label: 'DI / OS', icon: '🎫' },
  { href: '/chantiers', label: 'Projets & sites', icon: '🏢' },
  { href: '/lots', label: 'Lots techniques', icon: '🧩' },
  { href: '/parc', label: 'Actifs techniques', icon: '⚙️' },
  { href: '/planning', label: 'Planning', icon: '📅' },
  { href: '/stocks', label: 'Stocks', icon: '📦' },
  { href: '/analytique', label: 'Analytique', icon: '📈' },
  { href: '/equipe', label: 'Équipe & accès', icon: '👤' },
];

export function Sidebar() {
  const pathname = usePathname();
  const session = currentSession();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">GMAO <span>BTP</span></div>
      <nav className="sidebar-nav">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`sidebar-link ${pathname.startsWith(n.href) ? 'is-active' : ''}`}
          >
            <span aria-hidden>{n.icon}</span> {n.label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="sidebar-user">
          <strong>{session?.fullName ?? '—'}</strong>
          <span>{session?.role}</span>
        </div>
        <button onClick={logout} className="sidebar-logout">Déconnexion</button>
      </div>
    </aside>
  );
}
