'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { money, days, TICKET_STATUS_LABEL, URGENCY_LABEL, TYPE_LABEL } from '@/lib/format';
import { Bars, Kpi, pctTone } from '@/components/ui';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function OverviewPage() {
  const ov = useQuery({ queryKey: ['overview'], queryFn: () => api.overview() });
  const rep = useQuery({ queryKey: ['report', 'month'], queryFn: () => api.report('month', todayISO()) });

  const o = ov.data;
  const r = rep.data;

  return (
    <>
      <div className="page-h">
        <div>
          <h1>Vue d’ensemble</h1>
          <div className="sub">Situation en direct · rapport du mois — {r?.meta.label ?? '…'}</div>
        </div>
        <span className="readonly">Lecture seule</span>
      </div>

      <div className="kpis" style={{ marginTop: 14 }}>
        <Kpi label="DI ouvertes" value={o?.openTickets ?? '…'} />
        <Kpi label="Priorité 1 en cours" value={o?.blockingTickets ?? '…'} tone={o && o.blockingTickets > 0 ? 'critical' : 'good'} />
        <Kpi
          label="TRPP préventif (année)"
          value={o ? `${o.trppPct.toFixed(1)} %` : '…'}
          hint={o ? `cible > ${o.trppTarget} % · ${o.trppOverdue} en retard` : undefined}
          tone={o ? pctTone(o.trppPct, o.trppTarget, 80) : undefined}
        />
        <Kpi label="Indispo. installations" value={o ? `${o.fleetUnavailabilityPct.toFixed(1)} %` : '…'} tone={o && o.fleetUnavailabilityPct > 10 ? 'warning' : undefined} />
        <Kpi label="Coût maintenance (mois)" value={o ? money(o.monthMaintenanceCost) : '…'} />
        <Kpi label="Pièces sous seuil" value={o?.partsBelowReorder ?? '…'} tone={o && o.partsBelowReorder > 0 ? 'warning' : 'good'} />
      </div>

      {r && (
        <>
          <div className="card" style={{ marginTop: 16 }}>
            <h2>Activité du mois</h2>
            <div className="kpis">
              <Kpi label="DI reçues" value={r.kpis.created} />
              <Kpi label="DI clôturées" value={r.kpis.closed} />
              <Kpi label="Taux de clôture" value={r.kpis.closureRate == null ? '—' : `${r.kpis.closureRate}%`} tone={pctTone(r.kpis.closureRate, 80, 50)} />
              <Kpi label="Délai moyen de résolution" value={days(r.kpis.avgResolutionDays)} />
              <Kpi label="Backlog en retard" value={r.kpis.backlogOverdue} tone={r.kpis.backlogOverdue > 0 ? 'warning' : 'good'} />
              <Kpi label="Coût imputé (mois)" value={money(r.kpis.costTotal)} />
            </div>
          </div>

          <div className="grid cols-2">
            <div className="card">
              <h2>DI par statut</h2>
              <Bars rows={r.breakdowns.byStatus} labelMap={TICKET_STATUS_LABEL} />
            </div>
            <div className="card">
              <h2>DI par priorité</h2>
              <Bars rows={r.breakdowns.byUrgency} labelMap={URGENCY_LABEL} />
            </div>
            <div className="card">
              <h2>DI par lot technique</h2>
              <Bars rows={r.breakdowns.byLot} />
            </div>
            <div className="card">
              <h2>DI par projet / site</h2>
              <Bars rows={r.breakdowns.bySite} />
            </div>
          </div>

          <div className="grid cols-2">
            <div className="card">
              <h2>Coûts du mois par nature</h2>
              <Bars rows={r.costs.byKind} money />
            </div>
            <div className="card">
              <h2>Coûts du mois par lot</h2>
              <Bars rows={r.costs.byLot} money />
            </div>
          </div>

          <div className="card">
            <h2>Actifs les plus sollicités (mois)</h2>
            <div className="grid cols-2">
              <Bars rows={r.topAssets.byCount} />
              <Bars rows={r.topAssets.byCost} money />
            </div>
          </div>
        </>
      )}
    </>
  );
}
