'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';

export default function ChantiersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['sites'], queryFn: () => endpoints.sitesList() });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ code: '', name: '', address: '', startDate: '' });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const create = useMutation({
    mutationFn: () =>
      endpoints.createSite({
        code: f.code.trim(),
        name: f.name.trim(),
        address: f.address || undefined,
        startDate: f.startDate || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sites'] });
      setF({ code: '', name: '', address: '', startDate: '' });
      setOpen(false);
    },
  });

  return (
    <>
      <div className="shell-head">
        <h1>Chantiers</h1>
        <button className="btn" onClick={() => setOpen((o) => !o)}>{open ? 'Fermer' : '+ Nouveau chantier'}</button>
      </div>

      {open && (
        <form
          className="card"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, alignItems: 'end' }}
          onSubmit={(e) => { e.preventDefault(); if (f.code && f.name) create.mutate(); }}
        >
          <label className="fld"><span>Code analytique</span><input value={f.code} onChange={(e) => set('code', e.target.value)} placeholder="CH-DKR-012" required /></label>
          <label className="fld"><span>Nom</span><input value={f.name} onChange={(e) => set('name', e.target.value)} required /></label>
          <label className="fld"><span>Adresse</span><input value={f.address} onChange={(e) => set('address', e.target.value)} /></label>
          <label className="fld"><span>Début</span><input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></label>
          <button className="btn" disabled={!f.code || !f.name || create.isPending}>{create.isPending ? '…' : 'Créer'}</button>
          {create.isError && <p style={{ color: 'var(--tone-critical)', gridColumn: '1/-1', margin: 0 }}>{(create.error as Error).message}</p>}
        </form>
      )}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Code</th><th>Nom</th><th>Adresse</th><th>Tickets</th><th>Engins affectés</th><th>État</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="muted">Chargement…</td></tr>}
            {data?.data.map((s) => (
              <tr key={s.id}>
                <td style={{ fontWeight: 700 }}>{s.code}</td>
                <td>{s.name}</td>
                <td className="muted">{s.address ?? '—'}</td>
                <td>{s._count.tickets}</td>
                <td>{s._count.assignments}</td>
                <td>{s.active ? <span className="badge tone-good">Actif</span> : <span className="badge tone-muted">Clôturé</span>}</td>
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
