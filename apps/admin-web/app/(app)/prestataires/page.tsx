'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, endpoints, type Provider } from '@/lib/api';
import { matches } from '@/lib/search';

const errMsg = (e: unknown) =>
  e instanceof ApiError && e.body && typeof e.body === 'object'
    ? ((e.body as any).message ?? (e.body as any).error ?? 'Erreur')
    : (e as Error).message;

const emptyForm = { name: '', contactName: '', phone: '', email: '', siret: '', specialties: '' };

export default function PrestatairesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['providers', 'all'], queryFn: () => endpoints.providersList('?all=1') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['providers'] });

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [f, setF] = useState({ ...emptyForm });
  const [editId, setEditId] = useState<string | null>(null);
  const [ef, setEf] = useState({ ...emptyForm });
  const [rowErr, setRowErr] = useState<string | null>(null);

  const toPayload = (v: typeof emptyForm) => ({
    name: v.name.trim(),
    contactName: v.contactName.trim() || null,
    phone: v.phone.trim() || null,
    email: v.email.trim() || '',
    siret: v.siret.trim() || null,
    specialties: v.specialties.split(',').map((s) => s.trim()).filter(Boolean),
  });

  const create = useMutation({
    mutationFn: () => endpoints.createProvider(toPayload(f)),
    onSuccess: () => { refresh(); setF({ ...emptyForm }); setOpen(false); },
    onError: (e) => setRowErr(errMsg(e)),
  });
  const update = useMutation({
    mutationFn: () => endpoints.updateProvider(editId!, toPayload(ef)),
    onSuccess: () => { refresh(); setEditId(null); setRowErr(null); },
    onError: (e) => setRowErr(errMsg(e)),
  });
  const toggleActive = useMutation({
    mutationFn: (p: Provider) => endpoints.updateProvider(p.id, { active: !p.active }),
    onSuccess: refresh,
  });
  const del = useMutation({
    mutationFn: (id: string) => endpoints.deleteProvider(id),
    onSuccess: () => { refresh(); setRowErr(null); },
    onError: (e) => setRowErr(errMsg(e)),
  });

  const startEdit = (p: Provider) => {
    setEditId(p.id); setRowErr(null);
    setEf({
      name: p.name, contactName: p.contactName ?? '', phone: p.phone ?? '',
      email: p.email ?? '', siret: p.siret ?? '', specialties: (p.specialties ?? []).join(', '),
    });
  };

  const renderFields = (v: typeof emptyForm, on: (k: keyof typeof emptyForm, val: string) => void) => (
    <>
      <label className="fld"><span>Nom / raison sociale</span><input value={v.name} onChange={(e) => on('name', e.target.value)} required /></label>
      <label className="fld"><span>Contact</span><input value={v.contactName} onChange={(e) => on('contactName', e.target.value)} /></label>
      <label className="fld"><span>Téléphone</span><input value={v.phone} onChange={(e) => on('phone', e.target.value)} /></label>
      <label className="fld"><span>Email</span><input type="email" value={v.email} onChange={(e) => on('email', e.target.value)} /></label>
      <label className="fld"><span>SIRET / NINEA</span><input value={v.siret} onChange={(e) => on('siret', e.target.value)} /></label>
      <label className="fld"><span>Spécialités (séparées par des virgules)</span><input value={v.specialties} onChange={(e) => on('specialties', e.target.value)} placeholder="ascenseurs, SSI" /></label>
    </>
  );

  return (
    <>
      <div className="shell-head">
        <h1>Prestataires</h1>
        <button className="btn" onClick={() => setOpen((o) => !o)}>{open ? 'Fermer' : '+ Nouveau prestataire'}</button>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Entreprises et sous-traitants externes affectés aux interventions. Le « respect du planning » compare la
        date de fin réelle à la <strong>livraison prévue</strong> fixée au planning. Les techniciens internes se gèrent dans <Link href="/equipe">Équipe &amp; accès</Link>.
      </p>

      {open && (
        <form className="card" style={grid} onSubmit={(e) => { e.preventDefault(); if (f.name) create.mutate(); }}>
          {renderFields(f, (k, val) => setF((p) => ({ ...p, [k]: val })))}
          <button className="btn" disabled={!f.name || create.isPending}>{create.isPending ? '…' : 'Créer'}</button>
        </form>
      )}

      {rowErr && <p className="card" style={{ color: 'var(--tone-critical)', margin: '0 0 12px' }}>{rowErr}</p>}

      <div className="toolbar">
        <input type="search" placeholder="Rechercher un prestataire…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260, flex: 1 }} />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Nom</th><th>Contact</th><th>Spécialités</th><th>Interv.</th><th>Respect planning</th><th>Retard moy.</th><th>État</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="muted">Chargement…</td></tr>}
            {data?.data.filter((p) => matches(q, p.name, p.contactName, p.phone, p.email, p.siret, (p.specialties ?? []).join(' '))).map((p) => (
              editId === p.id ? (
                <tr key={p.id}>
                  <td colSpan={8}>
                    <form style={grid} onSubmit={(e) => { e.preventDefault(); update.mutate(); }}>
                      {renderFields(ef, (k, val) => setEf((x) => ({ ...x, [k]: val })))}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn" disabled={update.isPending}>Enregistrer</button>
                        <button type="button" className="btn btn-ghost" onClick={() => setEditId(null)}>Annuler</button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={p.id} style={p.active ? undefined : { opacity: 0.55 }}>
                  <td><Link href={`/prestataires/${p.id}`}>{p.name}</Link></td>
                  <td className="muted">{[p.contactName, p.phone].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="muted">{p.specialties?.join(', ') || '—'}</td>
                  <td>{p.kpis?.total ?? 0}{p.kpis?.open ? <span className="muted"> ({p.kpis.open} en cours)</span> : null}</td>
                  <td>
                    {p.kpis?.planRespectPct == null ? <span className="muted">—</span> : (
                      <span className={`badge tone-${p.kpis.planRespectPct >= 90 ? 'good' : p.kpis.planRespectPct >= 70 ? 'warning' : 'critical'}`}>
                        {p.kpis.planRespectPct}%
                      </span>
                    )}
                  </td>
                  <td className="muted">{p.kpis?.avgDelayDays == null ? '—' : `${p.kpis.avgDelayDays} j`}</td>
                  <td>
                    <button className="badge" style={{ cursor: 'pointer', border: 0 }} onClick={() => toggleActive.mutate(p)}>
                      {p.active ? <span className="tone-good">Actif</span> : <span className="tone-muted">Inactif</span>}
                    </button>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost" style={sm} onClick={() => startEdit(p)}>Modifier</button>{' '}
                    <button className="btn btn-ghost" style={{ ...sm, color: 'var(--tone-critical)' }} disabled={del.isPending}
                      onClick={() => { if (confirm(`Supprimer le prestataire « ${p.name} » ?`)) del.mutate(p.id); }}>
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

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, alignItems: 'end', margin: 0 };
const sm: React.CSSProperties = { padding: '4px 10px', fontSize: 12 };
