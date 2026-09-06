'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Iv } from '@/lib/api';
import { datetime, date, days as fdays, URGENCY_LABEL } from '@/lib/format';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const hit = (q: string, ...p: (string | null | undefined)[]) => {
  const n = norm(q.trim());
  return !n || norm(p.filter(Boolean).join(' ')).includes(n);
};
const who = (iv: Iv) => iv.mechanic?.fullName ?? iv.provider?.name ?? (iv.assigneeKind === 'PROVIDER' ? 'Prestataire' : 'Interne');
const kindLabel = (iv: Iv) => (iv.assigneeKind === 'PROVIDER' ? 'Prestataire' : 'Interne');

function Respect({ iv }: { iv: Iv }) {
  if (!iv.endedAt || !iv.expectedDeliveryAt) return <span className="muted">—</span>;
  const late = new Date(iv.endedAt) > new Date(iv.expectedDeliveryAt);
  const d = Math.round(((new Date(iv.endedAt).getTime() - new Date(iv.expectedDeliveryAt).getTime()) / 86_400_000) * 10) / 10;
  return late ? <span className="b critical">+{d} j</span> : <span className="b good">à l’heure</span>;
}

export default function ExecutionsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['interventions', 'all'], queryFn: () => api.interventions('') });
  const [q, setQ] = useState('');

  const { open, done } = useMemo(() => {
    const rows = (data?.data ?? []).filter((iv) =>
      hit(q, iv.ticket?.reference, iv.ticket?.title, iv.ticket?.site?.name, iv.ticket?.equipment?.name, who(iv)),
    );
    const cut = Date.now() - 60 * 86_400_000;
    return {
      open: rows.filter((iv) => !iv.endedAt).sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? '')),
      done: rows
        .filter((iv) => iv.endedAt && new Date(iv.endedAt).getTime() >= cut)
        .sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? '')),
    };
  }, [data, q]);

  return (
    <>
      <div className="page-h">
        <div>
          <h1>Exécutions</h1>
          <div className="sub">Interventions en cours, à venir et terminées (60 derniers jours)</div>
        </div>
        <span className="readonly">Lecture seule</span>
      </div>

      <div className="toolbar">
        <input type="search" placeholder="Rechercher (réf, objet, projet, actif, intervenant…)" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260, flex: 1 }} />
      </div>

      <div className="card">
        <h2>En cours &amp; à venir ({open.length})</h2>
        <div className="scroll-x">
          <table>
            <thead><tr><th>DI</th><th>Objet</th><th>Projet / actif</th><th>Intervenant</th><th>Type</th><th>Prévu</th><th>Livraison prévue</th><th>Statut</th></tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} className="muted">Chargement…</td></tr>}
              {!isLoading && !open.length && <tr><td colSpan={8} className="muted">Aucune intervention ouverte.</td></tr>}
              {open.map((iv) => (
                <tr key={iv.id}>
                  <td>{iv.ticket?.reference ?? '—'}</td>
                  <td>{iv.ticket?.title ?? '—'}</td>
                  <td className="muted">{iv.ticket?.site?.name}{iv.ticket?.equipment?.name ? ` · ${iv.ticket.equipment.name}` : ''}</td>
                  <td>{who(iv)}</td>
                  <td className="muted">{kindLabel(iv)}</td>
                  <td className="muted">{iv.scheduledFor ? datetime(iv.scheduledFor) : '—'}</td>
                  <td className="muted">{iv.expectedDeliveryAt ? date(iv.expectedDeliveryAt) : '—'}</td>
                  <td>{iv.startedAt ? <span className="b info">démarrée</span> : <span className="b neutral">planifiée</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Terminées — 60 jours ({done.length})</h2>
        <div className="scroll-x">
          <table>
            <thead><tr><th>DI</th><th>Objet</th><th>Projet / actif</th><th>Intervenant</th><th>Priorité</th><th>Terminée</th><th>Respect planning</th><th>Heures</th><th>Compte-rendu</th></tr></thead>
            <tbody>
              {!done.length && <tr><td colSpan={9} className="muted">Aucune intervention terminée sur la période.</td></tr>}
              {done.map((iv) => (
                <tr key={iv.id}>
                  <td>{iv.ticket?.reference ?? '—'}</td>
                  <td>{iv.ticket?.title ?? '—'}</td>
                  <td className="muted">{iv.ticket?.site?.name}{iv.ticket?.equipment?.name ? ` · ${iv.ticket.equipment.name}` : ''}</td>
                  <td>{who(iv)}</td>
                  <td>{iv.ticket ? URGENCY_LABEL[iv.ticket.urgency] ?? iv.ticket.urgency : '—'}</td>
                  <td className="muted">{datetime(iv.endedAt)}</td>
                  <td><Respect iv={iv} /></td>
                  <td>{iv.laborHours ?? '—'}</td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 280 }}>{iv.report || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
