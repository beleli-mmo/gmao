'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, endpoints } from '@/lib/api';
import { date, echeance } from '@/lib/format';
import { matches } from '@/lib/search';

const errMsg = (e: unknown) =>
  e instanceof ApiError && e.body && typeof e.body === 'object'
    ? ((e.body as any).message ?? (e.body as any).error ?? 'Erreur')
    : (e as Error).message;

const CATS = ['Berline', 'Pick-up', 'Utilitaire', '4x4', 'Camion', 'Moto'];
const FUELS = ['Diesel', 'Essence', 'Hybride', 'Électrique'];

export default function VehiculesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['vehicles'], queryFn: () => endpoints.vehiclesList(), refetchInterval: 30_000 });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [f, setF] = useState({ plate: '', brand: '', model: '', year: '', category: 'Pick-up', fuel: 'Diesel', assignedName: '', assignedFunction: '', currentKm: '', serviceIntervalKm: '10000' });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const create = useMutation({
    mutationFn: () =>
      endpoints.createVehicle({
        plate: f.plate.trim(),
        brand: f.brand.trim() || null,
        model: f.model.trim() || null,
        year: f.year ? Number(f.year) : null,
        category: f.category || null,
        fuel: f.fuel || null,
        assignedName: f.assignedName.trim() || null,
        assignedFunction: f.assignedFunction.trim() || null,
        currentKm: f.currentKm ? Number(f.currentKm) : 0,
        serviceIntervalKm: Number(f.serviceIntervalKm || 10000),
      }),
    onSuccess: (v) => { qc.invalidateQueries({ queryKey: ['vehicles'] }); router.push(`/vehicules/${v.id}`); },
    onError: (e) => setErr(errMsg(e)),
  });

  const rows = (list.data?.data ?? []).filter((v) =>
    matches(q, v.plate, v.reference, v.brand, v.model, v.assignedName, v.assignedFunction, v.category),
  );

  return (
    <>
      <div className="shell-head">
        <h1>Véhicules</h1>
        <button className="btn" onClick={() => setOpen((o) => !o)}>{open ? 'Fermer' : '+ Nouveau véhicule'}</button>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Parc automobile — suivi des assurances, visites techniques, relevés kilométriques et vidanges.
        Chaque véhicule a une fiche individuelle avec l’agent affecté.
      </p>

      {open && (
        <form className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, alignItems: 'end' }}
          onSubmit={(e) => { e.preventDefault(); if (f.plate.trim().length >= 2) create.mutate(); }}>
          <label className="fld"><span>Immatriculation</span><input value={f.plate} onChange={(e) => set('plate', e.target.value)} required placeholder="DK-1234-AB" /></label>
          <label className="fld"><span>Marque</span><input value={f.brand} onChange={(e) => set('brand', e.target.value)} /></label>
          <label className="fld"><span>Modèle</span><input value={f.model} onChange={(e) => set('model', e.target.value)} /></label>
          <label className="fld"><span>Année</span><input type="number" value={f.year} onChange={(e) => set('year', e.target.value)} /></label>
          <label className="fld"><span>Catégorie</span><select value={f.category} onChange={(e) => set('category', e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="fld"><span>Carburant</span><select value={f.fuel} onChange={(e) => set('fuel', e.target.value)}>{FUELS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="fld"><span>Agent affecté</span><input value={f.assignedName} onChange={(e) => set('assignedName', e.target.value)} placeholder="Nom" /></label>
          <label className="fld"><span>Fonction de l’agent</span><input value={f.assignedFunction} onChange={(e) => set('assignedFunction', e.target.value)} placeholder="Chef de chantier…" /></label>
          <label className="fld"><span>Km actuel</span><input type="number" value={f.currentKm} onChange={(e) => set('currentKm', e.target.value)} /></label>
          <label className="fld"><span>Périodicité vidange (km)</span><input type="number" value={f.serviceIntervalKm} onChange={(e) => set('serviceIntervalKm', e.target.value)} /></label>
          <button className="btn" disabled={f.plate.trim().length < 2 || create.isPending}>{create.isPending ? '…' : 'Créer la fiche'}</button>
          {err && <p style={{ color: 'var(--tone-critical)', gridColumn: '1/-1', margin: 0 }}>{err}</p>}
        </form>
      )}

      <div className="toolbar">
        <input type="search" placeholder="Rechercher (immat, marque, agent…)" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260, flex: 1 }} />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Immat.</th><th>Véhicule</th><th>Agent affecté</th><th>Km</th><th>Assurance</th><th>Visite technique</th><th>Prochaine vidange</th></tr></thead>
          <tbody>
            {list.isLoading && <tr><td colSpan={7} className="muted">Chargement…</td></tr>}
            {list.data && !rows.length && <tr><td colSpan={7} className="muted">Aucun véhicule.</td></tr>}
            {rows.map((v) => {
              const ins = echeance(v.insuranceDaysLeft);
              const insp = echeance(v.inspectionDaysLeft);
              return (
                <tr key={v.id} style={v.active ? undefined : { opacity: 0.55 }}>
                  <td><Link href={`/vehicules/${v.id}`}>{v.plate}</Link></td>
                  <td>{[v.brand, v.model].filter(Boolean).join(' ') || '—'}<span className="muted"> {v.category ?? ''}</span></td>
                  <td>{v.assignedName ?? '—'}{v.assignedFunction ? <span className="muted"> · {v.assignedFunction}</span> : null}</td>
                  <td>{Math.round(v.currentKm).toLocaleString('fr-FR')} km</td>
                  <td>{v.insuranceEndDate ? <><span className={`badge tone-${ins.tone}`}>{ins.text}</span> <span className="muted">{date(v.insuranceEndDate)}</span></> : <span className="muted">non renseignée</span>}</td>
                  <td>{v.inspectionValidUntil ? <><span className={`badge tone-${insp.tone}`}>{insp.text}</span> <span className="muted">{date(v.inspectionValidUntil)}</span></> : <span className="muted">non renseignée</span>}</td>
                  <td>{v.nextServiceKm != null ? <span className={v.kmToService != null && v.kmToService <= 500 ? 'badge tone-warning' : ''}>{Math.round(v.nextServiceKm).toLocaleString('fr-FR')} km{v.kmToService != null ? ` (${v.kmToService <= 0 ? 'dépassée' : `dans ${Math.round(v.kmToService).toLocaleString('fr-FR')} km`})` : ''}</span> : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
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
