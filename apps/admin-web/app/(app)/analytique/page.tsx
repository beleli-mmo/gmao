'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { CostBreakdownChart } from '@/components/CostBreakdownChart';
import { money } from '@/lib/format';

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getFullYear(), 0, 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function AnalytiquePage() {
  const [range, setRange] = useState(defaultRange());

  const byLot = useQuery({ queryKey: ['costByLot', range], queryFn: () => endpoints.costByLot(range.from, range.to) });
  const bySite = useQuery({ queryKey: ['costBySite', range], queryFn: () => endpoints.costBySite(range.from, range.to) });
  const trpp = useQuery({ queryKey: ['trpp', range], queryFn: () => endpoints.trpp(range.from, range.to) });
  const tco = useQuery({ queryKey: ['tco'], queryFn: endpoints.tco });
  const rel = useQuery({ queryKey: ['reliability', range], queryFn: () => endpoints.reliability(range.from, range.to) });

  return (
    <>
      <div className="shell-head"><h1>Analytique & imputation des coûts</h1></div>

      <div className="toolbar">
        <label>Du <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label>au <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
      </div>

      <div className="card">
        <h2>Coût de maintenance par lot technique</h2>
        {byLot.isLoading ? <p className="muted">Chargement…</p> : (
          <CostBreakdownChart
            rows={(byLot.data?.rows ?? []).map((r) => ({ code: r.lot_code, name: r.lot_name, kind: r.kind, total: r.total }))}
          />
        )}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>TRPP — Taux de Respect du Plan Préventif</h2>
          {trpp.data ? (
            <>
              <p style={{ fontSize: 28, fontWeight: 800, margin: '4px 0' }}>
                {trpp.data.pct.toFixed(1)} %
                <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}> — {trpp.data.respected}/{trpp.data.total} dans les délais · cible &gt; 95 %</span>
              </p>
              {trpp.data.overdue > 0 && (
                <p className="badge tone-critical" style={{ display: 'inline-block' }}>{trpp.data.overdue} préventif(s) en retard</p>
              )}
              <table style={{ marginTop: 10 }}>
                <thead><tr><th>Lot</th><th>Réalisés / dus</th><th style={{ textAlign: 'right' }}>Taux</th></tr></thead>
                <tbody>
                  {trpp.data.byLot.map((l) => (
                    <tr key={l.lot_code}>
                      <td>{l.lot_name}</td>
                      <td>{l.respected}/{l.total}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`badge tone-${l.pct >= 95 ? 'good' : l.pct >= 80 ? 'warning' : 'critical'}`}>{l.pct.toFixed(0)} %</span>
                      </td>
                    </tr>
                  ))}
                  {!trpp.data.byLot.length && <tr><td colSpan={3} className="muted">Aucun préventif à échéance sur la période.</td></tr>}
                </tbody>
              </table>
            </>
          ) : <p className="muted">Chargement…</p>}
        </div>

        <div className="card">
          <h2>Coût par projet / site</h2>
          <table>
            <thead><tr><th>Projet</th><th style={{ textAlign: 'right' }}>Total imputé</th></tr></thead>
            <tbody>
              {sumBy(bySite.data?.rows ?? [], (r) => r.site_name).map((r) => (
                <tr key={r.key}><td>{r.key}</td><td style={{ textAlign: 'right' }}>{money(r.total)}</td></tr>
              ))}
              {bySite.data && !bySite.data.rows.length && <tr><td colSpan={2} className="muted">Aucun coût sur la période.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Coût total de possession par actif</h2>
          <table>
            <thead><tr><th>Actif</th><th style={{ textAlign: 'right' }}>Maintenance</th><th style={{ textAlign: 'right' }}>Coût / h·km</th></tr></thead>
            <tbody>
              {(tco.data?.rows ?? []).map((r: any) => (
                <tr key={r.asset_tag}>
                  <td>{r.name}<div className="muted">{r.asset_tag}</div></td>
                  <td style={{ textAlign: 'right' }}>{money(r.maintenance)}</td>
                  <td style={{ textAlign: 'right' }}>{r.tco_per_unit ? money(r.tco_per_unit) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Fiabilité — MTTR & indisponibilité</h2>
          <table>
            <thead><tr><th>Actif</th><th>Incidents</th><th>MTTR (h)</th><th>Indispo.</th></tr></thead>
            <tbody>
              {(rel.data?.rows ?? []).map((r: any) => (
                <tr key={r.asset_tag}>
                  <td>{r.name}<div className="muted">{r.asset_tag}</div></td>
                  <td>{r.incidents}</td>
                  <td>{r.mttr_hours?.toFixed(1) ?? '—'}</td>
                  <td>{r.unavailability_pct?.toFixed(1) ?? '—'} %</td>
                </tr>
              ))}
              {rel.data && !rel.data.rows.length && <tr><td colSpan={4} className="muted">Aucun incident curatif clôturé sur la période.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function sumBy(rows: { total: number }[], keyFn: (r: any) => string) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(keyFn(r), (m.get(keyFn(r)) ?? 0) + r.total);
  return [...m.entries()].map(([key, total]) => ({ key, total })).sort((a, b) => b.total - a.total);
}
