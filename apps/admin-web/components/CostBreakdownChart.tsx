'use client';

import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { CostKind } from '@/lib/api';
import { COST_KIND_COLOR, COST_KIND_LABEL, COST_KIND_ORDER, money } from '@/lib/format';

interface Row {
  code: string;
  name: string;
  kind: CostKind;
  total: number;
}

/**
 * Imputation analytique : coût de maintenance par axe (chantier OU lot technique),
 * décomposé par nature. Barres empilées horizontales — identité par couleur
 * catégorielle (ordre fixe Okabe–Ito), légende toujours présente, tooltip par segment.
 */
export function CostBreakdownChart({ rows }: { rows: Row[] }) {
  const byKey = new Map<string, Record<string, number | string>>();
  for (const r of rows) {
    if (!byKey.has(r.code)) byKey.set(r.code, { label: r.name });
    byKey.get(r.code)![r.kind] = Number(r.total);
  }
  const data = [...byKey.values()].sort((a, b) => sum(b) - sum(a));

  if (!data.length) return <p className="muted">Aucun coût imputé sur la période.</p>;

  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 54 + 60)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barCategoryGap={14}>
          <CartesianGrid horizontal={false} stroke="var(--line)" />
          <XAxis
            type="number"
            tickFormatter={(v) => money(v)}
            stroke="var(--muted)"
            tick={{ fontSize: 12, fill: 'var(--muted)' }}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={200}
            stroke="var(--muted)"
            tick={{ fontSize: 12, fill: 'var(--text)' }}
          />
          <Tooltip
            cursor={{ fill: 'var(--hover)' }}
            formatter={(v: number, name: string) => [money(v), COST_KIND_LABEL[name as CostKind]]}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }}
          />
          <Legend formatter={(v) => COST_KIND_LABEL[v as CostKind]} />
          {COST_KIND_ORDER.map((kind, i) => (
            <Bar
              key={kind}
              dataKey={kind}
              stackId="cost"
              fill={COST_KIND_COLOR[kind]}
              radius={i === COST_KIND_ORDER.length - 1 ? [0, 4, 4, 0] : 0}
              stroke="var(--surface)"
              strokeWidth={2}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const sum = (r: Record<string, number | string>) =>
  COST_KIND_ORDER.reduce((s, k) => s + (Number(r[k]) || 0), 0);
