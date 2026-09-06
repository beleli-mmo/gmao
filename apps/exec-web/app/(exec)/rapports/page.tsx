'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type ReportData } from '@/lib/api';
import { money, datetime, date, days as fdays, TICKET_STATUS_LABEL, URGENCY_LABEL, TYPE_LABEL } from '@/lib/format';
import { Bars, Kpi, pctTone } from '@/components/ui';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function RapportsPage() {
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [d, setD] = useState(todayISO());
  const [siteId, setSiteId] = useState('');
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.sites() });
  const { data: r, isLoading } = useQuery({ queryKey: ['report', period, d, siteId], queryFn: () => api.report(period, d, siteId || undefined) });

  return (
    <>
      <div className="page-h">
        <div>
          <h1>Rapports</h1>
          <div className="sub">Synthèse hebdomadaire ou mensuelle — imprimable</div>
        </div>
        <button className="btn-ghost no-print" onClick={() => window.print()} disabled={!r}>🖨 Imprimer / PDF</button>
      </div>

      <div className="toolbar no-print">
        <select value={period} onChange={(e) => setPeriod(e.target.value as 'week' | 'month')}>
          <option value="week">Hebdomadaire</option>
          <option value="month">Mensuel</option>
        </select>
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} />
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          <option value="">Tous les projets</option>
          {sites.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {isLoading || !r ? <p className="muted">Chargement du rapport…</p> : <Report r={r} />}
    </>
  );
}

function Report({ r }: { r: ReportData }) {
  const k = r.kpis;
  return (
    <>
      <div className="card" style={{ background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }}>
        <h2 style={{ color: '#fff', opacity: 0.85 }}>Rapport de maintenance — {r.meta.period === 'month' ? 'mensuel' : 'hebdomadaire'}</h2>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{r.meta.label}</div>
        <div style={{ opacity: 0.85, fontSize: 13, marginTop: 4 }}>{r.meta.scope} · généré le {datetime(r.meta.generatedAt)}</div>
      </div>

      <div className="card">
        <h2>Synthèse</h2>
        <div className="kpis">
          <Kpi label="DI reçues" value={k.created} />
          <Kpi label="DI clôturées" value={k.closed} />
          <Kpi label="Taux de clôture" value={k.closureRate == null ? '—' : `${k.closureRate}%`} tone={pctTone(k.closureRate, 80, 50)} />
          <Kpi label="DI P1 urgentes" value={k.p1Created} tone={k.p1Created > 0 ? 'critical' : 'good'} />
          <Kpi label="Délai moyen résolution" value={fdays(k.avgResolutionDays)} />
          <Kpi label="Backlog ouvert" value={k.backlogOpen} hint={`dont ${k.backlogOverdue} en retard`} tone={k.backlogOverdue > 0 ? 'warning' : undefined} />
          <Kpi label="TRPP préventif" value={`${k.trppPct}%`} hint="cible > 95 %" tone={pctTone(k.trppPct, 95, 80)} />
          <Kpi label="Coût imputé" value={money(k.costTotal)} />
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card"><h2>DI par statut</h2><Bars rows={r.breakdowns.byStatus} labelMap={TICKET_STATUS_LABEL} /></div>
        <div className="card"><h2>DI par priorité</h2><Bars rows={r.breakdowns.byUrgency} labelMap={URGENCY_LABEL} /></div>
        <div className="card"><h2>DI par nature</h2><Bars rows={r.breakdowns.byType} labelMap={TYPE_LABEL} /></div>
        <div className="card"><h2>DI par lot technique</h2><Bars rows={r.breakdowns.byLot} /></div>
      </div>

      <div className="card">
        <h2>Plan préventif — TRPP</h2>
        <p style={{ marginTop: 0 }}><strong>{r.trpp.respected}/{r.trpp.total}</strong> échéances respectées — taux <strong>{r.trpp.pct}%</strong>{r.trpp.overdue > 0 && <span className="b critical" style={{ marginLeft: 8 }}>{r.trpp.overdue} en retard</span>}</p>
        {r.trpp.byLot.length > 0 && (
          <div className="scroll-x">
            <table>
              <thead><tr><th>Lot</th><th>Réalisés / dus</th><th>Taux</th></tr></thead>
              <tbody>{r.trpp.byLot.map((l) => (
                <tr key={l.key}><td>{l.key}</td><td>{l.respected}/{l.count}</td><td><span className={`b ${pctTone(l.pct ?? 0, 95, 80)}`}>{l.pct}%</span></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Coûts imputés — {money(r.costs.total)}</h2>
        <div className="grid cols-3">
          <div><h3 style={{ fontSize: 12, color: 'var(--muted)' }}>Par nature</h3><Bars rows={r.costs.byKind} money /></div>
          <div><h3 style={{ fontSize: 12, color: 'var(--muted)' }}>Par lot</h3><Bars rows={r.costs.byLot} money /></div>
          <div><h3 style={{ fontSize: 12, color: 'var(--muted)' }}>Par projet</h3><Bars rows={r.costs.bySite} money /></div>
        </div>
      </div>

      <div className="card">
        <h2>Intervenants — activité &amp; respect du planning</h2>
        <div className="scroll-x">
          <table>
            <thead><tr><th>Intervenant</th><th>Type</th><th>Interventions</th><th>Heures</th><th>Respect planning</th></tr></thead>
            <tbody>
              {!r.actors.length && <tr><td colSpan={5} className="muted">Aucune intervention terminée sur la période.</td></tr>}
              {r.actors.map((a) => (
                <tr key={a.name}>
                  <td>{a.name}</td><td className="muted">{a.kind}</td><td>{a.count}</td><td>{a.hours}</td>
                  <td>{a.planRespectPct == null ? <span className="muted">—</span> : <span className={`b ${pctTone(a.planRespectPct)}`}>{a.planRespectPct}%</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>DI clôturées ({r.closed.length})</h2>
        <div className="scroll-x">
          <table>
            <thead><tr><th>Réf.</th><th>Objet</th><th>Projet</th><th>Lot</th><th>Priorité</th><th>Clôturée</th><th>Délai</th><th>Coût</th></tr></thead>
            <tbody>
              {!r.closed.length && <tr><td colSpan={8} className="muted">Aucune clôture sur la période.</td></tr>}
              {r.closed.map((c) => (
                <tr key={c.reference}>
                  <td>{c.reference}</td><td>{c.title}</td><td className="muted">{c.siteName}</td><td className="muted">{c.lotName}</td>
                  <td>{URGENCY_LABEL[c.urgency] ?? c.urgency}</td><td className="muted">{date(c.closedAt)}</td><td>{fdays(c.resolutionDays)}</td><td>{money(c.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
