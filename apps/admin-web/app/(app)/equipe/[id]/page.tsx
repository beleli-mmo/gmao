'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { ROLE_LABEL, datetime, date } from '@/lib/format';

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: u, isLoading } = useQuery({ queryKey: ['user', id], queryFn: () => endpoints.user(id) });

  if (isLoading || !u) return <p className="muted">Chargement…</p>;
  const k = u.kpis;
  const pct = k.planRespectPct;

  return (
    <>
      <div className="shell-head">
        <div>
          <button className="btn btn-ghost" onClick={() => router.push('/equipe')} style={{ padding: '4px 10px', fontSize: 13 }}>← Équipe</button>
          <h1 style={{ marginTop: 8 }}>{u.fullName}</h1>
          <p className="muted">
            {ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] ?? u.role}
            {u.email ? ` · ${u.email}` : ''}{u.phone ? ` · ${u.phone}` : ''}
          </p>
        </div>
        {u.active === false && <span className="badge tone-muted">Désactivé</span>}
      </div>

      <div className="grid grid-kpi" style={{ marginBottom: 18 }}>
        <div className="kpi"><span className="kpi-label">Interventions</span><strong className="kpi-value">{k.total}</strong></div>
        <div className="kpi"><span className="kpi-label">Terminées</span><strong className="kpi-value">{k.done}</strong></div>
        <div className="kpi">
          <span className="kpi-label">Respect du planning</span>
          <strong className="kpi-value" style={{ color: pct == null ? undefined : pct >= 90 ? 'var(--tone-good)' : pct >= 70 ? 'var(--tone-warning)' : 'var(--tone-critical)' }}>
            {pct == null ? '—' : `${pct}%`}
          </strong>
          <span className="kpi-label">{k.withTarget ? `${k.onTime}/${k.withTarget} dans les délais` : 'aucune échéance fixée'}</span>
        </div>
        <div className="kpi"><span className="kpi-label">Retard moyen</span><strong className="kpi-value">{k.avgDelayDays == null ? '—' : `${k.avgDelayDays} j`}</strong></div>
        <div className="kpi"><span className="kpi-label">Heures pointées</span><strong className="kpi-value">{k.totalHours || 0} h</strong></div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <h2 style={{ padding: '14px 16px 0' }}>Historique des interventions</h2>
        <table>
          <thead>
            <tr>
              <th>DI</th><th>Objet</th><th>Projet / actif</th>
              <th>Planifié</th><th>Livraison prévue</th><th>Terminé</th>
              <th>Respect</th><th>Heures</th><th>Compte-rendu / feedback</th>
            </tr>
          </thead>
          <tbody>
            {!u.history.length && <tr><td colSpan={9} className="muted">Aucune intervention affectée.</td></tr>}
            {u.history.map((h) => (
              <tr key={h.id}>
                <td>{h.reference ? <Link href={`/tickets/${h.ticketId}`}>{h.reference}</Link> : '—'}</td>
                <td>{h.title ?? '—'}</td>
                <td className="muted">{h.siteName}{h.assetName ? ` · ${h.assetName}` : ''}</td>
                <td className="muted">{h.scheduledFor ? datetime(h.scheduledFor) : '—'}</td>
                <td className="muted">{h.expectedDeliveryAt ? date(h.expectedDeliveryAt) : '—'}</td>
                <td className="muted">{h.endedAt ? datetime(h.endedAt) : <span className="badge tone-info">en cours</span>}</td>
                <td>
                  {h.onTime == null ? <span className="muted">—</span>
                    : h.onTime ? <span className="badge tone-good">à l’heure</span>
                    : <span className="badge tone-critical">+{h.delayDays} j</span>}
                </td>
                <td>{h.laborHours ?? '—'}</td>
                <td style={{ maxWidth: 320, whiteSpace: 'pre-wrap' }}>{h.report || <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
