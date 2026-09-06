'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { endpoints, type Money, type ReportData, type Tally } from '@/lib/api';
import {
  TICKET_STATUS_LABEL, URGENCY_LABEL, TICKET_TYPE_LABEL, money, datetime, date,
} from '@/lib/format';

const todayISO = () => new Date().toISOString().slice(0, 10);
const fdays = (n: number | null) => (n == null ? '—' : n < 1 ? `${Math.round(n * 24)} h` : `${n} j`);

function BarList({ rows, labelMap, colored }: { rows: (Tally | Money)[]; labelMap?: Record<string, string>; colored?: boolean }) {
  const val = (r: any) => (r.count ?? r.total ?? 0);
  const max = Math.max(1, ...rows.map(val));
  const isMoney = rows.length > 0 && (rows[0] as any).count === undefined;
  return (
    <div className="rp-bars">
      {!rows.length && <p className="muted" style={{ margin: 0 }}>Aucune donnée.</p>}
      {rows.map((r) => (
        <div className="rp-bar" key={r.key}>
          <span className="rp-bar-l">{labelMap?.[r.key] ?? r.key}</span>
          <span className="rp-bar-track">
            <span className="rp-bar-fill" style={{ width: `${(val(r) / max) * 100}%`, background: colored && (r as any).color ? (r as any).color : 'var(--primary)' }} />
          </span>
          <span className="rp-bar-v">{isMoney ? money(val(r)) : val(r)}</span>
        </div>
      ))}
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="rp-kpi">
      <span className="rp-kpi-l">{label}</span>
      <strong className="rp-kpi-v" style={tone ? { color: `var(--tone-${tone})` } : undefined}>{value}</strong>
      {hint && <span className="rp-kpi-h">{hint}</span>}
    </div>
  );
}

export default function RapportsPage() {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [d, setD] = useState(todayISO());
  const [siteId, setSiteId] = useState('');
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => endpoints.sitesList() });
  const { data: r, isLoading, isFetching } = useQuery({
    queryKey: ['report', period, d, siteId],
    queryFn: () => endpoints.report(period, d, siteId || undefined),
  });

  return (
    <>
      <div className="shell-head no-print">
        <h1>Rapports</h1>
        <button className="btn" onClick={() => window.print()} disabled={!r}>🖨 Imprimer / PDF</button>
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
        <span className="muted" style={{ fontSize: 12 }}>{isFetching ? 'Calcul…' : ''}</span>
      </div>

      {isLoading || !r ? (
        <p className="muted">Chargement du rapport…</p>
      ) : (
        <RenderReport r={r} />
      )}

      <style jsx global>{`
        .report { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
        .rp-cover { background: var(--primary); color: #fff; padding: 22px 26px; }
        .rp-cover h2 { margin: 0; font-size: 22px; letter-spacing: .5px; }
        .rp-cover .rp-sub { opacity: .9; margin-top: 4px; font-size: 14px; }
        .rp-cover .rp-gen { opacity: .75; font-size: 12px; margin-top: 10px; }
        .rp-sec { padding: 20px 26px; border-top: 1px solid var(--line); }
        .rp-sec > h3 { margin: 0 0 14px; font-size: 15px; text-transform: uppercase; letter-spacing: .6px; color: var(--muted); }
        .rp-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
        .rp-kpi { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
        .rp-kpi-l { font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: var(--muted); }
        .rp-kpi-v { font-size: 22px; font-weight: 800; }
        .rp-kpi-h { font-size: 11px; color: var(--muted); }
        .rp-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 22px; }
        .rp-grid2 h4 { margin: 0 0 8px; font-size: 13px; }
        .rp-bars { display: flex; flex-direction: column; gap: 6px; }
        .rp-bar { display: grid; grid-template-columns: 140px 1fr 74px; align-items: center; gap: 10px; font-size: 13px; }
        .rp-bar-l { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .rp-bar-track { background: var(--line); border-radius: 999px; height: 10px; overflow: hidden; }
        .rp-bar-fill { display: block; height: 100%; border-radius: 999px; }
        .rp-bar-v { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
        @media print {
          .sidebar, .no-print { display: none !important; }
          .shell, .shell-main { display: block !important; padding: 0 !important; }
          .report { border: 0; }
          .rp-sec { break-inside: avoid; }
          .rp-cover { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .rp-bar-fill { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          table { break-inside: auto; }
          tr { break-inside: avoid; }
          @page { margin: 14mm; }
        }
      `}</style>
    </>
  );
}

function RenderReport({ r }: { r: ReportData }) {
  const k = r.kpis;
  return (
    <div className="report">
      <div className="rp-cover">
        <h2>RAPPORT DE MAINTENANCE — {r.meta.period === 'month' ? 'MENSUEL' : 'HEBDOMADAIRE'}</h2>
        <div className="rp-sub">{r.meta.label} · {r.meta.scope}</div>
        <div className="rp-gen">Généré le {datetime(r.meta.generatedAt)}</div>
      </div>

      {/* 1. Synthèse */}
      <div className="rp-sec">
        <h3>1 · Synthèse de la période</h3>
        <div className="rp-kpis">
          <Kpi label="DI reçues" value={k.created} />
          <Kpi label="DI clôturées" value={k.closed} />
          <Kpi label="Taux de clôture" value={k.closureRate == null ? '—' : `${k.closureRate}%`} tone={k.closureRate != null && k.closureRate >= 80 ? 'good' : k.closureRate != null && k.closureRate >= 50 ? 'warning' : 'critical'} />
          <Kpi label="DI P1 · Urgentes" value={k.p1Created} tone={k.p1Created > 0 ? 'critical' : 'good'} />
          <Kpi label="Délai moyen de résolution" value={fdays(k.avgResolutionDays)} />
          <Kpi label="Backlog ouvert" value={k.backlogOpen} hint={`dont ${k.backlogOverdue} en retard`} tone={k.backlogOverdue > 0 ? 'warning' : undefined} />
          <Kpi label="TRPP préventif" value={`${k.trppPct}%`} hint="cible > 95 %" tone={k.trppPct >= 95 ? 'good' : k.trppPct >= 80 ? 'warning' : 'critical'} />
          <Kpi label="Coût maintenance imputé" value={money(k.costTotal)} />
          <Kpi label="DI ouverte la plus ancienne" value={k.oldestOpen ? date(k.oldestOpen) : '—'} />
        </div>
      </div>

      {/* 2. Répartition */}
      <div className="rp-sec">
        <h3>2 · Répartition des DI reçues ({k.created})</h3>
        <div className="rp-grid2">
          <div><h4>Par statut</h4><BarList rows={r.breakdowns.byStatus} labelMap={TICKET_STATUS_LABEL as any} /></div>
          <div><h4>Par priorité</h4><BarList rows={r.breakdowns.byUrgency} labelMap={URGENCY_LABEL as any} /></div>
          <div><h4>Par nature</h4><BarList rows={r.breakdowns.byType} labelMap={TICKET_TYPE_LABEL as any} /></div>
          <div><h4>Par lot technique</h4><BarList rows={r.breakdowns.byLot} colored /></div>
          <div><h4>Par projet / site</h4><BarList rows={r.breakdowns.bySite} /></div>
        </div>
      </div>

      {/* 3. Préventif */}
      <div className="rp-sec">
        <h3>3 · Plan préventif — TRPP</h3>
        <p style={{ margin: '0 0 10px' }}>
          <strong>{r.trpp.respected}/{r.trpp.total}</strong> échéances respectées sur la période — taux <strong>{r.trpp.pct}%</strong>
          {r.trpp.overdue > 0 && <span className="badge tone-critical" style={{ marginLeft: 8 }}>{r.trpp.overdue} en retard</span>}
        </p>
        {r.trpp.byLot.length > 0 && (
          <table>
            <thead><tr><th>Lot</th><th>Réalisés / dus</th><th style={{ textAlign: 'right' }}>Taux</th></tr></thead>
            <tbody>
              {r.trpp.byLot.map((l) => (
                <tr key={l.key}>
                  <td>{l.key}</td><td>{l.respected}/{l.count}</td>
                  <td style={{ textAlign: 'right' }}><span className={`badge tone-${(l.pct ?? 0) >= 95 ? 'good' : (l.pct ?? 0) >= 80 ? 'warning' : 'critical'}`}>{l.pct}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 4. Coûts */}
      <div className="rp-sec">
        <h3>4 · Coûts imputés sur la période — {money(r.costs.total)}</h3>
        <div className="rp-grid2">
          <div><h4>Par nature</h4><BarList rows={r.costs.byKind} /></div>
          <div><h4>Par lot technique</h4><BarList rows={r.costs.byLot} colored /></div>
          <div><h4>Par projet / site</h4><BarList rows={r.costs.bySite} /></div>
        </div>
      </div>

      {/* 5. Intervenants */}
      <div className="rp-sec">
        <h3>5 · Intervenants — activité & respect du planning</h3>
        {r.actors.length ? (
          <table>
            <thead><tr><th>Intervenant</th><th>Type</th><th>Interventions</th><th>Heures</th><th style={{ textAlign: 'right' }}>Respect planning</th></tr></thead>
            <tbody>
              {r.actors.map((a) => (
                <tr key={a.name}>
                  <td>{a.name}</td><td className="muted">{a.kind}</td><td>{a.count}</td><td>{a.hours}</td>
                  <td style={{ textAlign: 'right' }}>
                    {a.planRespectPct == null ? <span className="muted">—</span> :
                      <span className={`badge tone-${a.planRespectPct >= 90 ? 'good' : a.planRespectPct >= 70 ? 'warning' : 'critical'}`}>{a.planRespectPct}%</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">Aucune intervention terminée sur la période.</p>}
      </div>

      {/* 6. Top actifs */}
      <div className="rp-sec">
        <h3>6 · Actifs les plus sollicités</h3>
        <div className="rp-grid2">
          <div><h4>Par nombre de DI</h4><BarList rows={r.topAssets.byCount} /></div>
          <div><h4>Par coût imputé</h4><BarList rows={r.topAssets.byCost as Money[]} /></div>
        </div>
      </div>

      {/* 7. Détail clôturées */}
      <div className="rp-sec">
        <h3>7 · DI clôturées sur la période ({r.closed.length})</h3>
        {r.closed.length ? (
          <table>
            <thead>
              <tr><th>Réf.</th><th>Objet</th><th>Projet</th><th>Lot</th><th>Priorité</th><th>Clôturée le</th><th>Délai</th><th style={{ textAlign: 'right' }}>Coût</th></tr>
            </thead>
            <tbody>
              {r.closed.map((c) => (
                <tr key={c.reference}>
                  <td>{c.reference}</td>
                  <td>{c.title}</td>
                  <td className="muted">{c.siteName}</td>
                  <td className="muted">{c.lotName}</td>
                  <td>{(URGENCY_LABEL as any)[c.urgency] ?? c.urgency}</td>
                  <td className="muted">{c.closedAt ? date(c.closedAt) : '—'}</td>
                  <td>{fdays(c.resolutionDays)}</td>
                  <td style={{ textAlign: 'right' }}>{money(c.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">Aucune clôture sur la période.</p>}
      </div>
    </div>
  );
}
