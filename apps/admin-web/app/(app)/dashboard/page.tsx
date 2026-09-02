'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { KpiCard } from '@/components/KpiCard';
import { TicketStatusBadge } from '@/components/StatusBadge';
import { money, datetime, TICKET_STATUS_ORDER } from '@/lib/format';

export default function DashboardPage() {
  const overview = useQuery({ queryKey: ['overview'], queryFn: endpoints.overview });
  const blocking = useQuery({
    queryKey: ['tickets', 'blocking'],
    queryFn: () => endpoints.ticketsList('?urgency=N1_BLOQUANT&status=EN_ATTENTE,QUALIFIE,PLANIFIE,EN_COURS&take=8'),
  });

  const o = overview.data;

  return (
    <>
      <div className="shell-head">
        <h1>Tableau de bord</h1>
        <span className="muted">Mise à jour en direct</span>
      </div>

      <div className="grid grid-kpi" style={{ marginBottom: 20 }}>
        <KpiCard label="DI ouvertes" value={o?.openTickets ?? '—'} />
        <KpiCard
          label="Priorité 1 en cours"
          value={o?.blockingTickets ?? '—'}
          tone={o && o.blockingTickets > 0 ? 'critical' : 'good'}
        />
        <KpiCard
          label="TRPP (année)"
          value={o ? `${o.trppPct.toFixed(1)} %` : '—'}
          hint={o ? `Cible > ${o.trppTarget}% · ${o.trppOverdue} préventif(s) en retard` : undefined}
          tone={o ? (o.trppPct >= o.trppTarget ? 'good' : o.trppPct >= 80 ? 'warning' : 'critical') : 'neutral'}
        />
        <KpiCard
          label="Indispo. installations"
          value={o ? `${o.fleetUnavailabilityPct.toFixed(1)} %` : '—'}
          tone={o && o.fleetUnavailabilityPct > 10 ? 'warning' : 'neutral'}
        />
        <KpiCard
          label="Pièces sous seuil"
          value={o?.partsBelowReorder ?? '—'}
          tone={o && o.partsBelowReorder > 0 ? 'warning' : 'good'}
        />
        <KpiCard label="Coût maintenance (mois)" value={o ? money(o.monthMaintenanceCost) : '—'} />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>File des tickets</h2>
          <table>
            <tbody>
              {TICKET_STATUS_ORDER.map((s) => {
                const n = o?.ticketsByStatus.find((x) => x.status === s)?.count ?? 0;
                return (
                  <tr key={s}>
                    <td><TicketStatusBadge status={s} /></td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{n}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Priorité 1 en cours</h2>
          {blocking.data?.data.length ? (
            <table>
              <thead><tr><th>DI</th><th>Lot</th><th>Actif</th><th>Statut</th><th>Créé</th></tr></thead>
              <tbody>
                {blocking.data.data.map((t) => (
                  <tr key={t.id}>
                    <td><Link href={`/tickets/${t.id}`}>{t.reference}</Link></td>
                    <td>{t.lot ? <span className="badge" style={{ background: `${t.lot.color}22`, color: t.lot.color }}>{t.lot.code}</span> : '—'}</td>
                    <td>{t.equipment?.assetTag ?? '—'}</td>
                    <td><TicketStatusBadge status={t.status} /></td>
                    <td className="muted">{datetime(t.createdAtField)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">Aucune DI de priorité 1 ouverte. 👍</p>
          )}
        </div>
      </div>
    </>
  );
}
