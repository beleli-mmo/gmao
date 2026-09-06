'use client';

import { money } from '@/lib/format';
import type { MoneyRow, Tally } from '@/lib/api';

export function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: 'good' | 'warning' | 'critical' }) {
  return (
    <div className={`kpi${tone ? ' ' + tone : ''}`}>
      <span className="l">{label}</span>
      <strong className="v">{value}</strong>
      {hint && <span className="h">{hint}</span>}
    </div>
  );
}

export function Bars({ rows, labelMap, money: isMoney }: { rows: (Tally | MoneyRow)[]; labelMap?: Record<string, string>; money?: boolean }) {
  const val = (r: any) => (isMoney ? r.total ?? 0 : r.count ?? r.total ?? 0);
  const max = Math.max(1, ...rows.map(val));
  if (!rows.length) return <p className="muted" style={{ margin: 0 }}>Aucune donnée.</p>;
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar" key={r.key}>
          <span className="bl">{labelMap?.[r.key] ?? r.key}</span>
          <span className="bt"><span className="bf" style={{ width: `${(val(r) / max) * 100}%`, background: (r as any).color || undefined }} /></span>
          <span className="bv">{isMoney ? money(val(r)) : val(r)}</span>
        </div>
      ))}
    </div>
  );
}

export function pctTone(pct: number | null, good = 90, warn = 70): 'good' | 'warning' | 'critical' | undefined {
  if (pct == null) return undefined;
  return pct >= good ? 'good' : pct >= warn ? 'warning' : 'critical';
}
