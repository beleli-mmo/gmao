'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, endpoints, type LotRow } from '@/lib/api';

const FREQ = ['Quotidien', 'Hebdomadaire', 'Mensuel', 'Trimestriel', 'Semestriel', 'Annuel', 'Quinquennal'];

const errMsg = (e: unknown) =>
  e instanceof ApiError && e.body && typeof e.body === 'object'
    ? ((e.body as any).message ?? (e.body as any).error ?? 'Erreur')
    : (e as Error).message;

export default function LotsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['lots', 'all'], queryFn: () => endpoints.lotsList('?all=1') });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ code: '', name: '', defaultFrequency: 'Mensuel', isRegulatory: false, color: '#64748b' });
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  const [editId, setEditId] = useState<string | null>(null);
  const [ef, setEf] = useState<{ code: string; name: string; defaultFrequency: string; isRegulatory: boolean; color: string }>({
    code: '', name: '', defaultFrequency: 'Mensuel', isRegulatory: false, color: '#64748b',
  });
  const [rowErr, setRowErr] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['lots'] });

  const create = useMutation({
    mutationFn: () => endpoints.createLot(f),
    onSuccess: () => { refresh(); setF({ code: '', name: '', defaultFrequency: 'Mensuel', isRegulatory: false, color: '#64748b' }); setOpen(false); },
  });

  const update = useMutation({
    mutationFn: () => endpoints.updateLot(editId!, ef),
    onSuccess: () => { refresh(); setEditId(null); setRowErr(null); },
    onError: (e) => setRowErr(errMsg(e)),
  });
  const toggleActive = useMutation({
    mutationFn: (l: LotRow) => endpoints.updateLot(l.id, { active: !l.active }),
    onSuccess: refresh,
  });
  const del = useMutation({
    mutationFn: (id: string) => endpoints.deleteLot(id),
    onSuccess: () => { refresh(); setRowErr(null); },
    onError: (e) => setRowErr(errMsg(e)),
  });

  const startEdit = (l: LotRow) => {
    setEditId(l.id); setRowErr(null);
    setEf({ code: l.code, name: l.name, defaultFrequency: l.defaultFrequency ?? 'Mensuel', isRegulatory: l.isRegulatory, color: l.color });
  };

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
          {create.isError && <p style={{ color: 'var(--tone-critical)', gridColumn: '1/-1', margin: 0 }}>{errMsg(create.error)}</p>}
        </form>
      )}

      {rowErr && <p className="card" style={{ color: 'var(--tone-critical)', margin: '0 0 12px' }}>{rowErr}</p>}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Code</th><th>Lot technique</th><th>Fréquence type</th><th>Réglementaire</th><th>Actifs</th><th>DI</th><th>État</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="muted">Chargement…</td></tr>}
            {data?.data.map((l) => (
              editId === l.id ? (
                <tr key={l.id}>
                  <td><input value={ef.code} maxLength={8} onChange={(e) => setEf({ ...ef, code: e.target.value.toUpperCase() })} style={inp} /></td>
                  <td><input value={ef.name} onChange={(e) => setEf({ ...ef, name: e.target.value })} style={inp} /></td>
                  <td>
                    <select value={ef.defaultFrequency} onChange={(e) => setEf({ ...ef, defaultFrequency: e.target.value })} style={inp}>
                      {FREQ.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </td>
                  <td><input type="checkbox" checked={ef.isRegulatory} onChange={(e) => setEf({ ...ef, isRegulatory: e.target.checked })} /></td>
                  <td>{l._count.equipment}</td>
                  <td>{l._count.tickets}</td>
                  <td><input type="color" value={ef.color} onChange={(e) => setEf({ ...ef, color: e.target.value })} style={{ width: 40, height: 28, padding: 0, border: 0, background: 'none' }} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn" style={sm} disabled={update.isPending} onClick={() => update.mutate()}>Enregistrer</button>{' '}
                    <button className="btn btn-ghost" style={sm} onClick={() => setEditId(null)}>Annuler</button>
                  </td>
                </tr>
              ) : (
                <tr key={l.id} style={l.active ? undefined : { opacity: 0.55 }}>
                  <td><span className="badge" style={{ background: `${l.color}22`, color: l.color }}>{l.code}</span></td>
                  <td>{l.name}</td>
                  <td className="muted">{l.defaultFrequency ?? '—'}</td>
                  <td>{l.isRegulatory ? <span className="badge tone-info">Oui</span> : <span className="muted">—</span>}</td>
                  <td>{l._count.equipment}</td>
                  <td>{l._count.tickets}</td>
                  <td>
                    <button className="badge" style={{ cursor: 'pointer', border: 0 }} onClick={() => toggleActive.mutate(l)} title="Basculer actif / inactif">
                      {l.active ? <span className="tone-good">Actif</span> : <span className="tone-muted">Inactif</span>}
                    </button>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost" style={sm} onClick={() => startEdit(l)}>Modifier</button>{' '}
                    <button className="btn btn-ghost" style={{ ...sm, color: 'var(--tone-critical)' }}
                      disabled={del.isPending}
                      onClick={() => { if (confirm(`Supprimer le lot « ${l.name} » ?`)) del.mutate(l.id); }}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              )
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

const inp: React.CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', font: 'inherit' };
const sm: React.CSSProperties = { padding: '4px 10px', fontSize: 12 };
