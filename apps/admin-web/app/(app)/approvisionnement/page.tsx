'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, endpoints } from '@/lib/api';
import { currentSession } from '@/lib/auth';
import { datetime, SUPPLY_STATUS_LABEL, SUPPLY_STATUS_TONE } from '@/lib/format';
import { matches } from '@/lib/search';

const errMsg = (e: unknown) =>
  e instanceof ApiError && e.body && typeof e.body === 'object'
    ? ((e.body as any).message ?? (e.body as any).error ?? 'Erreur')
    : (e as Error).message;

type Line = { label: string; quantity: string; unit: string };
const emptyLine = (): Line => ({ label: '', quantity: '1', unit: 'U' });

export default function ApproPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const role = currentSession()?.role;
  const canCreate = role === 'FIELD_MANAGER' || role === 'ADMIN';

  const list = useQuery({ queryKey: ['supply'], queryFn: () => endpoints.supplyList(), refetchInterval: 20_000 });
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => endpoints.sitesList(), enabled: canCreate });

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [f, setF] = useState({ siteId: '', title: '', note: '', needBy: '' });
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [err, setErr] = useState<string | null>(null);

  const setLine = (i: number, k: keyof Line, v: string) => setLines((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const create = useMutation({
    mutationFn: () =>
      endpoints.createSupply({
        siteId: f.siteId,
        title: f.title.trim(),
        note: f.note.trim() || undefined,
        needBy: f.needBy || undefined,
        items: lines
          .filter((l) => l.label.trim())
          .map((l) => ({ label: l.label.trim(), quantity: Number(l.quantity || 1), unit: l.unit.trim() || 'U' })),
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['supply'] });
      router.push(`/approvisionnement/${r.id}`);
    },
    onError: (e) => setErr(errMsg(e)),
  });

  const validLines = lines.filter((l) => l.label.trim());
  const canSubmit = f.siteId && f.title.trim().length >= 3 && validLines.length >= 1 && !create.isPending;

  const rows = (list.data?.data ?? []).filter((s) =>
    matches(q, s.reference, s.title, s.site?.name, s.requester?.fullName, s.purchaseOrderRef ?? undefined),
  );

  return (
    <>
      <div className="shell-head">
        <h1>Approvisionnement</h1>
        {canCreate && <button className="btn" onClick={() => setOpen((o) => !o)}>{open ? 'Fermer' : '+ Nouvelle demande'}</button>}
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Demandes de matériel : le chef de chantier crée et envoie, le directeur technique valide (bon de commande),
        le chef confirme la réception, le contrôleur vérifie l’installation sur le terrain.
      </p>

      {open && canCreate && (
        <form className="card" onSubmit={(e) => { e.preventDefault(); if (canSubmit) create.mutate(); }} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
            <label className="fld"><span>Chantier</span>
              <select value={f.siteId} onChange={(e) => setF({ ...f, siteId: e.target.value })} required>
                <option value="">—</option>
                {sites.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="fld"><span>Objet de la demande</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required placeholder="Ex : Matériel électrique 2e étage" /></label>
            <label className="fld"><span>Besoin pour le (optionnel)</span><input type="date" value={f.needBy} onChange={(e) => setF({ ...f, needBy: e.target.value })} /></label>
          </div>
          <label className="fld"><span>Note (optionnel)</span><textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>ARTICLES</div>
            {lines.map((l, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 32px', gap: 8, marginBottom: 6 }}>
                <input placeholder="Désignation de l’article" value={l.label} onChange={(e) => setLine(i, 'label', e.target.value)} style={inp} />
                <input type="number" min="0" step="any" placeholder="Qté" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} style={inp} />
                <input placeholder="Unité" value={l.unit} onChange={(e) => setLine(i, 'unit', e.target.value)} style={inp} />
                <button type="button" className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setLines((p) => p.filter((_, j) => j !== i))} disabled={lines.length === 1}>✕</button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setLines((p) => [...p, emptyLine()])}>+ Ajouter un article</button>
          </div>

          {err && <p style={{ color: 'var(--tone-critical)', margin: 0 }}>{err}</p>}
          <div><button className="btn" disabled={!canSubmit}>{create.isPending ? '…' : 'Envoyer la demande'}</button></div>
        </form>
      )}

      <div className="toolbar">
        <input type="search" placeholder="Rechercher (réf, objet, chantier, demandeur, BC)…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260, flex: 1 }} />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Réf.</th><th>Objet</th><th>Chantier</th><th>Demandeur</th><th>Articles</th><th>Bon de commande</th><th>Statut</th><th>Créée</th></tr></thead>
          <tbody>
            {list.isLoading && <tr><td colSpan={8} className="muted">Chargement…</td></tr>}
            {list.data && !rows.length && <tr><td colSpan={8} className="muted">Aucune demande d’approvisionnement.</td></tr>}
            {rows.map((s) => (
              <tr key={s.id}>
                <td><Link href={`/approvisionnement/${s.id}`}>{s.reference}</Link></td>
                <td>{s.title}</td>
                <td className="muted">{s.site?.name}</td>
                <td className="muted">{s.requester?.fullName}</td>
                <td>{s._count.items}</td>
                <td className="muted">{s.purchaseOrderRef ?? '—'}</td>
                <td><span className={`badge tone-${SUPPLY_STATUS_TONE[s.status]}`}>{SUPPLY_STATUS_LABEL[s.status]}</span></td>
                <td className="muted">{datetime(s.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .fld { display: flex; flex-direction: column; gap: 5px; }
        .fld > span { font-size: 12px; font-weight: 700; color: var(--muted); }
        .fld input, .fld select, .fld textarea { padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; }
      `}</style>
    </>
  );
}

const inp: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', font: 'inherit' };
