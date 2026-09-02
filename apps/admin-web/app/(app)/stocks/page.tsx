'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { money } from '@/lib/format';

export default function StocksPage() {
  const qc = useQueryClient();
  const [onlyLow, setOnlyLow] = useState(false);
  const [open, setOpen] = useState(false);
  const [receiving, setReceiving] = useState<string | null>(null);
  const [f, setF] = useState({ sku: '', label: '', category: '', unitCost: '', reorderPoint: '', reorderQty: '', initialStock: '' });
  const [rcv, setRcv] = useState({ quantity: '', unitCost: '', reference: '' });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ['parts', onlyLow],
    queryFn: () => endpoints.parts(onlyLow),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['parts'] });
    qc.invalidateQueries({ queryKey: ['overview'] });
  };

  const create = useMutation({
    mutationFn: () =>
      endpoints.createPart({
        sku: f.sku.trim(), label: f.label.trim(), category: f.category || undefined,
        unitCost: Number(f.unitCost || 0),
        reorderPoint: Number(f.reorderPoint || 0),
        reorderQty: Number(f.reorderQty || 0),
        initialStock: Number(f.initialStock || 0),
      }),
    onSuccess: () => { invalidate(); setF({ sku: '', label: '', category: '', unitCost: '', reorderPoint: '', reorderQty: '', initialStock: '' }); setOpen(false); },
  });

  const receive = useMutation({
    mutationFn: (id: string) =>
      endpoints.receiveStock(id, { quantity: Number(rcv.quantity), unitCost: Number(rcv.unitCost), reference: rcv.reference || undefined }),
    onSuccess: () => { invalidate(); setReceiving(null); setRcv({ quantity: '', unitCost: '', reference: '' }); },
  });

  return (
    <>
      <div className="shell-head">
        <h1>Stocks — pièces & consommables</h1>
        <button className="btn" onClick={() => setOpen((o) => !o)}>{open ? 'Fermer' : '+ Nouvelle pièce'}</button>
      </div>

      {open && (
        <form
          className="card"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, alignItems: 'end' }}
          onSubmit={(e) => { e.preventDefault(); if (f.sku && f.label) create.mutate(); }}
        >
          <label className="fld"><span>SKU</span><input value={f.sku} onChange={(e) => set('sku', e.target.value)} required /></label>
          <label className="fld"><span>Libellé</span><input value={f.label} onChange={(e) => set('label', e.target.value)} required /></label>
          <label className="fld"><span>Catégorie</span><input value={f.category} onChange={(e) => set('category', e.target.value)} /></label>
          <label className="fld"><span>Coût unit. (XOF)</span><input type="number" value={f.unitCost} onChange={(e) => set('unitCost', e.target.value)} required /></label>
          <label className="fld"><span>Seuil réappro</span><input type="number" value={f.reorderPoint} onChange={(e) => set('reorderPoint', e.target.value)} /></label>
          <label className="fld"><span>Qté réappro</span><input type="number" value={f.reorderQty} onChange={(e) => set('reorderQty', e.target.value)} /></label>
          <label className="fld"><span>Stock initial</span><input type="number" value={f.initialStock} onChange={(e) => set('initialStock', e.target.value)} /></label>
          <button className="btn" disabled={!f.sku || !f.label || create.isPending}>{create.isPending ? '…' : 'Créer'}</button>
          {create.isError && <p style={{ color: 'var(--tone-critical)', gridColumn: '1/-1', margin: 0 }}>{(create.error as Error).message}</p>}
        </form>
      )}

      <div className="toolbar">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />
          Seulement sous le seuil de réappro
        </label>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>SKU</th><th>Libellé</th><th>Catégorie</th><th>En stock</th><th>Seuil</th><th>Coût unit.</th><th>Alerte</th><th></th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="muted">Chargement…</td></tr>}
            {data?.data.map((p: any) => (
              <tr key={p.id}>
                <td>{p.sku}</td>
                <td>{p.label}</td>
                <td className="muted">{p.category ?? '—'}</td>
                <td style={{ fontWeight: 700 }}>{p.onHand} {p.unit}</td>
                <td>{Number(p.reorderPoint)}</td>
                <td>{money(p.unitCost)}</td>
                <td>{p.needsReorder ? <span className="badge tone-warning">À commander ({Number(p.reorderQty)})</span> : <span className="badge tone-good">OK</span>}</td>
                <td>
                  {receiving === p.id ? (
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <input style={inp} type="number" placeholder="Qté" value={rcv.quantity} onChange={(e) => setRcv({ ...rcv, quantity: e.target.value })} />
                      <input style={inp} type="number" placeholder="Coût u." value={rcv.unitCost} onChange={(e) => setRcv({ ...rcv, unitCost: e.target.value })} />
                      <button className="btn" disabled={!rcv.quantity || !rcv.unitCost || receive.isPending} onClick={() => receive.mutate(p.id)}>OK</button>
                      <button className="btn btn-ghost" onClick={() => setReceiving(null)}>✕</button>
                    </span>
                  ) : (
                    <button className="btn btn-ghost" onClick={() => { setReceiving(p.id); setRcv({ quantity: '', unitCost: String(p.unitCost), reference: '' }); }}>Réception</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .fld { display: flex; flex-direction: column; gap: 5px; }
        .fld > span { font-size: 12px; font-weight: 700; color: var(--muted); }
        .fld input { padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; }
      `}</style>
    </>
  );
}

const inp: React.CSSProperties = {
  width: 70, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6,
  background: 'var(--surface)', color: 'var(--text)',
};
