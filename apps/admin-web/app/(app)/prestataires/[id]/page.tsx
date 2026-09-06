'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { datetime, date } from '@/lib/format';

export default function PrestataireDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: p, isLoading } = useQuery({ queryKey: ['provider', id], queryFn: () => endpoints.provider(id) });

  if (isLoading || !p) return <p className="muted">Chargement…</p>;
  const k = p.kpis;

  return (
    <>
      <div className="shell-head">
        <div>
          <button className="btn btn-ghost" onClick={() => router.push('/prestataires')} style={{ padding: '4px 10px', fontSize: 13 }}>← Prestataires</button>
          <h1 style={{ marginTop: 8 }}>{p.name}</h1>
          <p className="muted">
            {[p.contactName, p.phone, p.email].filter(Boolean).join(' · ') || '—'}
            {p.specialties?.length ? <> — {p.specialties.join(', ')}</> : null}
          </p>
        </div>
        {!p.active && <span className="badge tone-muted">Inactif</span>}
      </div>

      <div className="grid grid-kpi" style={{ marginBottom: 18 }}>
        <div className="kpi"><span className="kpi-label">Interventions</span><strong className="kpi-value">{k.total}</strong></div>
        <div className="kpi"><span className="kpi-label">Terminées</span><strong className="kpi-value">{k.done}</strong></div>
        <div className="kpi">
          <span className="kpi-label">Respect du planning</span>
          <strong className="kpi-value" style={{ color: k.planRespectPct == null ? undefined : k.planRespectPct >= 90 ? 'var(--tone-good)' : k.planRespectPct >= 70 ? 'var(--tone-warning)' : 'var(--tone-critical)' }}>
            {k.planRespectPct == null ? '—' : `${k.planRespectPct}%`}
          </strong>
          <span className="kpi-label">{k.withTarget ? `${k.onTime}/${k.withTarget} dans les délais` : 'aucune échéance fixée'}</span>
        </div>
        <div className="kpi"><span className="kpi-label">Retard moyen</span><strong className="kpi-value">{k.avgDelayDays == null ? '—' : `${k.avgDelayDays} j`}</strong></div>
        <div className="kpi"><span className="kpi-label">Heures facturées</span><strong className="kpi-value">{k.totalHours || 0} h</strong></div>
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
            {!p.history.length && <tr><td colSpan={9} className="muted">Aucune intervention.</td></tr>}
            {p.history.map((h) => (
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
