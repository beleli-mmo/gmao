'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';

const FREQ = ['Quotidien', 'Hebdomadaire', 'Mensuel', 'Trimestriel', 'Semestriel', 'Annuel', 'Quinquennal'];

export default function LotsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['lots'], queryFn: () => endpoints.lotsList() });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ code: '', name: '', defaultFrequency: 'Mensuel', isRegulatory: false, color: '#64748b' });
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  const create = useMutation({
    mutationFn: () => endpoints.createLot(f),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lots'] }); setF({ code: '', name: '', defaultFrequency: 'Mensuel', isRegulatory: false, color: '#64748b' }); setOpen(false); },
  });

  return (
    <>
      <div className="shell-head">
        <h1>Lots techniques</h1>
        <button className="btn" onClick={() => setOpen((o) => !o)}>{open ? 'Fermer' : '+ Nouveau lot'}</button>
      </div>

      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Segmentation de l’exploitation en lots techniques et architecturaux. Axe d’imputation des coûts
        (répartition par lot) et de pilotage du plan préventif.
      </p>

      {open && (
        <form
          className="card"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, alignItems: 'end' }}
          onSubmit={(e) => { e.preventDefault(); if (f.code && f.name) create.mutate(); }}
        >
          <label className="fld"><span>Code</span><input value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} maxLength={8} placeholder="ASC" required /></label>
          <label className="fld"><span>Libellé</span><input value={f.name} onChange={(e) => set('name', e.target.value)} required /></label>
          <label className="fld"><span>Fréquence par défaut</span>
            <select value={f.defaultFrequency} onChange={(e) => set('defaultFrequency', e.target.value)}>
              {FREQ.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label className="fld"><span>Couleur</span><input type="color" value={f.color} onChange={(e) => set('color', e.target.value)} style={{ height: 38, padding: 2 }} /></label>
          <label className="fld" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={f.isRegulatory} onChange={(e) => set('isRegulatory', e.target.checked)} />
            <span style={{ fontSize: 13 }}>Contrôle réglementaire</span>
          </label>
          <button className="btn" disabled={!f.code || !f.name || create.isPending}>{create.isPending ? '…' : 'Créer'}</button>
          {create.isError && <p style={{ color: 'var(--tone-critical)', gridColumn: '1/-1', margin: 0 }}>{(create.error as Error).message}</p>}
        </form>
      )}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Code</th><th>Lot technique</th><th>Fréquence type</th><th>Réglementaire</th><th>Actifs</th><th>DI</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="muted">Chargement…</td></tr>}
            {data?.data.map((l) => (
              <tr key={l.id}>
                <td><span className="badge" style={{ background: `${l.color}22`, color: l.color }}>{l.code}</span></td>
                <td>{l.name}</td>
                <td className="muted">{l.defaultFrequency ?? '—'}</td>
                <td>{l.isRegulatory ? <span className="badge tone-info">Oui</span> : <span className="muted">—</span>}</td>
                <td>{l._count.equipment}</td>
                <td>{l._count.tickets}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .fld { display: flex; flex-direction: column; gap: 5px; }
        .fld > span { font-size: 12px; font-weight: 700; color: var(--muted); }
        .fld input, .fld select { padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; }
      `}</style>
    </>
  );
}
