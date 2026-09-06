'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, endpoints, type SiteRow } from '@/lib/api';
import { matches } from '@/lib/search';

const errMsg = (e: unknown) =>
  e instanceof ApiError && e.body && typeof e.body === 'object'
    ? ((e.body as any).message ?? (e.body as any).error ?? 'Erreur')
    : (e as Error).message;

export default function ChantiersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['sites'], queryFn: () => endpoints.sitesList() });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ code: '', name: '', address: '', startDate: '' });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const [q, setQ] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [ef, setEf] = useState({ code: '', name: '', address: '' });
  const [rowErr, setRowErr] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['sites'] });

  const create = useMutation({
    mutationFn: () =>
      endpoints.createSite({
        code: f.code.trim(), name: f.name.trim(),
        address: f.address || undefined, startDate: f.startDate || undefined,
      }),
    onSuccess: () => { refresh(); setF({ code: '', name: '', address: '', startDate: '' }); setOpen(false); },
  });

  const update = useMutation({
    mutationFn: () => endpoints.updateSite(editId!, { code: ef.code.trim(), name: ef.name.trim(), address: ef.address.trim() || null }),
    onSuccess: () => { refresh(); setEditId(null); setRowErr(null); },
    onError: (e) => setRowErr(errMsg(e)),
  });

  const toggleActive = useMutation({
    mutationFn: (s: SiteRow) => endpoints.updateSite(s.id, { active: !s.active }),
    onSuccess: refresh,
  });

  const del = useMutation({
    mutationFn: (id: string) => endpoints.deleteSite(id),
    onSuccess: () => { refresh(); setRowErr(null); },
    onError: (e) => setRowErr(errMsg(e)),
  });

  const startEdit = (s: SiteRow) => { setEditId(s.id); setEf({ code: s.code, name: s.name, address: s.address ?? '' }); setRowErr(null); };

  return (
    <>
      <div className="shell-head">
        <h1>Projets & sites</h1>
        <button className="btn" onClick={() => setOpen((o) => !o)}>{open ? 'Fermer' : '+ Nouveau projet'}</button>
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
          {create.isError && <p style={{ color: 'var(--tone-critical)', gridColumn: '1/-1', margin: 0 }}>{errMsg(create.error)}</p>}
        </form>
      )}

      {rowErr && <p className="card" style={{ color: 'var(--tone-critical)', margin: '0 0 12px' }}>{rowErr}</p>}

      <div className="toolbar">
        <input type="search" placeholder="Rechercher un projet…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260, flex: 1 }} />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Code</th><th>Nom</th><th>Adresse</th><th>DI</th><th>Actifs</th><th>État</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="muted">Chargement…</td></tr>}
            {data?.data.filter((s) => matches(q, s.code, s.name, s.address)).map((s) => (
              editId === s.id ? (
                <tr key={s.id}>
                  <td><input value={ef.code} onChange={(e) => setEf({ ...ef, code: e.target.value })} style={inp} /></td>
                  <td><input value={ef.name} onChange={(e) => setEf({ ...ef, name: e.target.value })} style={inp} /></td>
                  <td><input value={ef.address} onChange={(e) => setEf({ ...ef, address: e.target.value })} style={inp} /></td>
                  <td>{s._count.tickets}</td>
                  <td>{s._count.assignments}</td>
                  <td>—</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn" style={sm} disabled={update.isPending} onClick={() => update.mutate()}>Enregistrer</button>{' '}
                    <button className="btn btn-ghost" style={sm} onClick={() => setEditId(null)}>Annuler</button>
                  </td>
                </tr>
              ) : (
                <tr key={s.id}>
                  <td style={{ fontWeight: 700 }}>{s.code}</td>
                  <td>{s.name}</td>
                  <td className="muted">{s.address ?? '—'}</td>
                  <td>{s._count.tickets}</td>
                  <td>{s._count.assignments}</td>
                  <td>
                    <button className="badge" style={{ cursor: 'pointer', border: 0 }} onClick={() => toggleActive.mutate(s)}
                      title="Basculer actif / clôturé">
                      {s.active ? <span className="tone-good">Actif</span> : <span className="tone-muted">Clôturé</span>}
                    </button>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost" style={sm} onClick={() => startEdit(s)}>Modifier</button>{' '}
                    <button className="btn btn-ghost" style={{ ...sm, color: 'var(--tone-critical)' }}
                      disabled={del.isPending}
                      onClick={() => { if (confirm(`Supprimer le projet « ${s.name} » ?`)) del.mutate(s.id); }}>
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
        .fld input { padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; }
      `}</style>
    </>
  );
}

const inp: React.CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', font: 'inherit' };
const sm: React.CSSProperties = { padding: '4px 10px', fontSize: 12 };
