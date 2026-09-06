'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { Bars, pctTone } from '@/components/ui';

const yStart = () => new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

/** agrège des lignes {kind,total} par clé (lot ou site) toutes natures confondues */
function aggregate(rows: any[], keyField: string) {
  const m = new Map<string, { key: string; total: number; color?: string }>();
  for (const r of rows) {
    const k = r[keyField];
    const cur = m.get(k) ?? { key: k, total: 0, color: r.color };
    cur.total += Number(r.total || 0);
    m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

export default function AnalytiquePage() {
  const [from, setFrom] = useState(yStart());
  const [to, setTo] = useState(today());

  const byLot = useQuery({ queryKey: ['costByLot', from, to], queryFn: () => api.costByLot(from, to) });
  const bySite = useQuery({ queryKey: ['costBySite', from, to], queryFn: () => api.costBySite(from, to) });
  const trpp = useQuery({ queryKey: ['trpp', from, to], queryFn: () => api.trpp(from, to) });
  const rel = useQuery({ queryKey: ['reliability', from, to], queryFn: () => api.reliability(from, to) });
  const tco = useQuery({ queryKey: ['tco'], queryFn: () => api.tco() });

  return (
    <>
      <div className="page-h">
        <div>
          <h1>Analytique</h1>
          <div className="sub">Coûts, fiabilité et respect du plan préventif</div>
        </div>
        <span className="readonly">Lecture seule</span>
      </div>

      <div className="toolbar">
        <label style={{ fontSize: 13 }}>Du <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label style={{ fontSize: 13 }}>au <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>Coût de maintenance par lot technique</h2>
          {byLot.data ? <Bars rows={aggregate(byLot.data.rows, 'lot_name')} money /> : <p className="muted">Chargement…</p>}
        </div>
        <div className="card">
          <h2>Coût par projet / site</h2>
          {bySite.data ? <Bars rows={aggregate(bySite.data.rows, 'site_name')} money /> : <p className="muted">Chargement…</p>}
        </div>
      </div>

      <div className="card">
        <h2>TRPP — respect du plan préventif</h2>
        {trpp.data ? (
          <>
            <p style={{ marginTop: 0, fontSize: 18 }}>
              <strong>{trpp.data.pct.toFixed(1)} %</strong>
              <span className="muted" style={{ fontSize: 13 }}> — {trpp.data.respected}/{trpp.data.total} dans les délais · cible &gt; 95 %</span>
              {trpp.data.overdue > 0 && <span className="b critical" style={{ marginLeft: 8 }}>{trpp.data.overdue} en retard</span>}
            </p>
            <div className="scroll-x">
              <table>
                <thead><tr><th>Lot</th><th>Réalisés / dus</th><th>Taux</th></tr></thead>
                <tbody>
                  {trpp.data.byLot.map((l) => (
                    <tr key={l.lot_name}><td>{l.lot_name}</td><td>{l.respected}/{l.total}</td><td><span className={`b ${pctTone(l.pct, 95, 80)}`}>{l.pct.toFixed(0)}%</span></td></tr>
                  ))}
                  {!trpp.data.byLot.length && <tr><td colSpan={3} className="muted">Aucun préventif à échéance sur la période.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="muted">Chargement…</p>}
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>Fiabilité — MTTR &amp; indisponibilité</h2>
          <div className="scroll-x">
            <table>
              <thead><tr><th>Actif</th><th>Incidents</th><th>MTTR (h)</th><th>Indispo.</th></tr></thead>
              <tbody>
                {(rel.data?.rows ?? []).map((r: any) => (
                  <tr key={r.asset_tag}><td>{r.name}<div className="muted" style={{ fontSize: 11 }}>{r.asset_tag}</div></td><td>{r.incidents}</td><td>{r.mttr_hours?.toFixed(1) ?? '—'}</td><td>{r.unavailability_pct?.toFixed(1) ?? '—'} %</td></tr>
                ))}
                {rel.data && !rel.data.rows.length && <tr><td colSpan={4} className="muted">Aucun incident curatif clôturé sur la période.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2>Coût total de possession par actif</h2>
          <div className="scroll-x">
            <table>
              <thead><tr><th>Actif</th><th>Maintenance</th><th>Coût / h·km</th></tr></thead>
              <tbody>
                {(tco.data?.rows ?? []).map((r: any) => (
                  <tr key={r.asset_tag}><td>{r.name}<div className="muted" style={{ fontSize: 11 }}>{r.asset_tag}</div></td><td>{money(r.maintenance)}</td><td>{r.tco_per_unit ? money(r.tco_per_unit) : '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
