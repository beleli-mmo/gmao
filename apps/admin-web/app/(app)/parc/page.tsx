'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endpoints, type EquipmentStatus } from '@/lib/api';
import { EquipmentStatusBadge } from '@/components/StatusBadge';
import { EQUIPMENT_STATUS_LABEL, CRITICALITY_LABEL } from '@/lib/format';

const STATUSES: EquipmentStatus[] = ['EN_SERVICE', 'EN_PANNE', 'EN_MAINTENANCE', 'EN_TRANSIT', 'REFORME'];
const KINDS = ['INSTALLATION', 'EQUIPEMENT', 'ORGANE', 'OUVRAGE'] as const;

export default function ParcPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [lotFilter, setLotFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    lotId: '', siteId: '', zone: '', typeCode: '', seq: '', name: '', kind: 'EQUIPEMENT',
    criticality: 'STANDARD', meterKind: 'NONE', brand: '', model: '', acquisitionCost: '',
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const lots = useQuery({ queryKey: ['lots'], queryFn: () => endpoints.lotsList() });
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => endpoints.sitesList() });
  const { data, isLoading } = useQuery({
    queryKey: ['equipment', status, lotFilter],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      if (lotFilter) qs.set('lotId', lotFilter);
      return endpoints.equipmentList(qs.toString() ? `?${qs}` : '');
    },
  });

  const setStat = useMutation({
    mutationFn: ({ id, s }: { id: string; s: EquipmentStatus }) => endpoints.equipmentStatus(id, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipment'] }),
  });

  const siteCode = sites.data?.data.find((s) => s.id === f.siteId)?.code ?? 'PROJ';
  const lotCode = lots.data?.data.find((l) => l.id === f.lotId)?.code ?? 'LOT';
  const zoneCode = (f.zone || 'ZON').split(/[ —-]/)[0].slice(0, 3).toUpperCase();
  const suggestedTag = `${siteCode}-${lotCode}-${zoneCode}-${(f.typeCode || 'TYP').toUpperCase()}-${(f.seq || '01').padStart(2, '0')}`;

  const create = useMutation({
    mutationFn: () =>
      endpoints.createEquipment({
        assetTag: suggestedTag,
        name: f.name.trim(),
        kind: f.kind,
        lotId: f.lotId || undefined,
        zone: f.zone || undefined,
        criticality: f.criticality,
        meterKind: f.meterKind,
        brand: f.brand || undefined,
        model: f.model || undefined,
        acquisitionCost: f.acquisitionCost ? Number(f.acquisitionCost) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment'] });
      setF({ ...f, zone: '', typeCode: '', seq: '', name: '', brand: '', model: '', acquisitionCost: '' });
      setOpen(false);
    },
  });

  return (
    <>
      <div className="shell-head">
        <h1>Actifs techniques</h1>
        <button className="btn" onClick={() => setOpen((o) => !o)}>{open ? 'Fermer' : '+ Nouvel actif'}</button>
      </div>

      {open && (
        <form
          className="card"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, alignItems: 'end' }}
          onSubmit={(e) => { e.preventDefault(); if (f.name && f.lotId && f.siteId) create.mutate(); }}
        >
          <label className="fld"><span>Projet / site</span>
            <select value={f.siteId} onChange={(e) => set('siteId', e.target.value)} required>
              <option value="">—</option>
              {sites.data?.data.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
            </select>
          </label>
          <label className="fld"><span>Lot technique</span>
            <select value={f.lotId} onChange={(e) => set('lotId', e.target.value)} required>
              <option value="">—</option>
              {lots.data?.data.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
            </select>
          </label>
          <label className="fld"><span>Zone / niveau</span><input value={f.zone} onChange={(e) => set('zone', e.target.value)} placeholder="RDC, N2, Toiture…" /></label>
          <label className="fld"><span>Code type</span><input value={f.typeCode} onChange={(e) => set('typeCode', e.target.value)} placeholder="CAB, TGB, SUR…" maxLength={4} /></label>
          <label className="fld"><span>N°</span><input value={f.seq} onChange={(e) => set('seq', e.target.value)} placeholder="01" maxLength={3} /></label>
          <label className="fld"><span>Désignation</span><input value={f.name} onChange={(e) => set('name', e.target.value)} required /></label>
          <label className="fld"><span>Nature</span><select value={f.kind} onChange={(e) => set('kind', e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
          <label className="fld"><span>Criticité</span>
            <select value={f.criticality} onChange={(e) => set('criticality', e.target.value)}>
              {Object.entries(CRITICALITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="fld"><span>Compteur</span>
            <select value={f.meterKind} onChange={(e) => set('meterKind', e.target.value)}>
              <option value="NONE">Aucun</option><option value="HEURES">Heures</option><option value="KM">Km</option>
            </select>
          </label>
          <label className="fld"><span>Valeur d’acquisition</span><input type="number" value={f.acquisitionCost} onChange={(e) => set('acquisitionCost', e.target.value)} /></label>
          <button className="btn" disabled={!f.name || !f.lotId || !f.siteId || create.isPending}>{create.isPending ? '…' : 'Créer'}</button>
          <p className="muted" style={{ gridColumn: '1/-1', margin: 0 }}>Référence générée : <code>{suggestedTag}</code> — QR <code>GMAO:{suggestedTag}</code></p>
          {create.isError && <p style={{ color: 'var(--tone-critical)', gridColumn: '1/-1', margin: 0 }}>{(create.error as Error).message}</p>}
        </form>
      )}

      <div className="toolbar">
        <select value={lotFilter} onChange={(e) => setLotFilter(e.target.value)}>
          <option value="">Tous les lots</option>
          {lots.data?.data.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {STATUSES.map((s) => <option key={s} value={s}>{EQUIPMENT_STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Référence</th><th>Désignation</th><th>Lot</th><th>Zone</th><th>Criticité</th><th>Compteur</th><th>Statut</th><th>Changer</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="muted">Chargement…</td></tr>}
            {data?.data.map((e) => (
              <tr key={e.id}>
                <td><Link href={`/parc/${e.id}`}>{e.assetTag}</Link></td>
                <td>{e.name}</td>
                <td>{e.lot ? <span className="badge" style={{ background: `${e.lot.color}22`, color: e.lot.color }}>{e.lot.code}</span> : '—'}</td>
                <td className="muted">{e.zone ?? '—'}</td>
                <td>{CRITICALITY_LABEL[e.criticality ?? 'STANDARD']}</td>
                <td>{e.meterKind === 'NONE' ? '—' : `${e.currentMeter} ${e.meterKind === 'HEURES' ? 'h' : 'km'}`}</td>
                <td><EquipmentStatusBadge status={e.status} /></td>
                <td>
                  <select value={e.status} onChange={(ev) => setStat.mutate({ id: e.id, s: ev.target.value as EquipmentStatus })}>
                    {STATUSES.map((s) => <option key={s} value={s}>{EQUIPMENT_STATUS_LABEL[s]}</option>)}
                  </select>
                </td>
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
