'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { URGENCY_LABEL } from '@/lib/format';

const TYPES = [
  { v: 'PANNE_CRITIQUE', l: 'Curatif — panne / dysfonctionnement' },
  { v: 'MAINTENANCE_PREVENTIVE', l: 'Préventif — opération planifiée' },
  { v: 'DEMANDE_PIECE', l: 'Demande de pièce / consommable' },
] as const;

export default function NewTicketPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const sites = useQuery({ queryKey: ['sites'], queryFn: () => endpoints.sitesList() });
  const equipment = useQuery({ queryKey: ['equipment', 'all'], queryFn: () => endpoints.equipmentList() });
  const reporters = useQuery({ queryKey: ['users', 'FIELD_MANAGER'], queryFn: () => endpoints.usersList('FIELD_MANAGER') });

  const [f, setF] = useState({
    type: 'PANNE_CRITIQUE',
    urgency: 'N2_MAJEUR',
    siteId: '',
    equipmentId: '',
    reporterId: '',
    title: '',
    description: '',
    meterValue: '',
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const needsEquipment = f.type !== 'DEMANDE_PIECE';
  const selectedEq = useMemo(
    () => equipment.data?.data.find((e) => e.id === f.equipmentId),
    [equipment.data, f.equipmentId],
  );
  const needsMeter = needsEquipment && selectedEq && selectedEq.meterKind !== 'NONE';

  const create = useMutation({
    mutationFn: () =>
      endpoints.createTicket({
        type: f.type,
        urgency: f.urgency,
        siteId: f.siteId,
        equipmentId: needsEquipment ? f.equipmentId : undefined,
        reporterId: f.reporterId,
        title: f.title,
        description: f.description || undefined,
        meterValue: needsMeter && f.meterValue ? Number(f.meterValue) : undefined,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      router.push(`/tickets/${r.id}`);
    },
  });

  const valid =
    f.siteId && f.reporterId && f.title.trim().length >= 3 && (!needsEquipment || f.equipmentId);

  return (
    <>
      <div className="shell-head">
        <h1>Nouvelle demande d’intervention</h1>
        <button className="btn btn-ghost" onClick={() => router.push('/tickets')}>Annuler</button>
      </div>

      <form
        className="card"
        style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) create.mutate();
        }}
      >
        <label className="fld">
          <span>Type</span>
          <select value={f.type} onChange={(e) => set('type', e.target.value)}>
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </label>

        <label className="fld">
          <span>Priorité</span>
          <select value={f.urgency} onChange={(e) => set('urgency', e.target.value)}>
            {(['N1_BLOQUANT', 'N2_MAJEUR', 'N3_MINEUR'] as const).map((u) => (
              <option key={u} value={u}>{URGENCY_LABEL[u]}</option>
            ))}
          </select>
        </label>

        <label className="fld">
          <span>Projet / site (imputation)</span>
          <select value={f.siteId} onChange={(e) => set('siteId', e.target.value)} required>
            <option value="">— Sélectionner —</option>
            {sites.data?.data.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
          </select>
        </label>

        {needsEquipment && (
          <label className="fld">
            <span>Actif concerné (le lot est repris automatiquement)</span>
            <select value={f.equipmentId} onChange={(e) => set('equipmentId', e.target.value)} required>
              <option value="">— Sélectionner —</option>
              {equipment.data?.data.map((e) => <option key={e.id} value={e.id}>{e.assetTag} · {e.name}</option>)}
            </select>
          </label>
        )}

        {needsMeter && (
          <label className="fld">
            <span>Index compteur ({selectedEq!.meterKind === 'HEURES' ? 'heures' : 'km'}) — actuel {selectedEq!.currentMeter}</span>
            <input
              type="number"
              inputMode="decimal"
              value={f.meterValue}
              onChange={(e) => set('meterValue', e.target.value)}
              placeholder={`≥ ${selectedEq!.currentMeter}`}
            />
          </label>
        )}

        <label className="fld">
          <span>Demandeur</span>
          <select value={f.reporterId} onChange={(e) => set('reporterId', e.target.value)} required>
            <option value="">— Sélectionner —</option>
            {reporters.data?.data.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
        </label>

        <label className="fld">
          <span>Objet</span>
          <input value={f.title} maxLength={140} onChange={(e) => set('title', e.target.value)} placeholder="Ex : détecteur SSI en défaut zone N2" required />
        </label>

        <label className="fld">
          <span>Détails</span>
          <textarea rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} />
        </label>

        {create.isError && <p style={{ color: 'var(--tone-critical)' }}>{(create.error as Error).message}</p>}

        <div>
          <button className="btn" disabled={!valid || create.isPending}>
            {create.isPending ? 'Création…' : 'Créer la demande'}
          </button>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          La demande est créée au statut <strong>DI reçue</strong> et apparaît immédiatement dans la file de traitement et sur le tableau de bord.
        </p>
      </form>

      <style jsx>{`
        .fld { display: flex; flex-direction: column; gap: 5px; }
        .fld > span { font-size: 13px; font-weight: 700; color: var(--muted); }
        .fld input, .fld select, .fld textarea {
          padding: 10px 12px; border: 1px solid var(--line); border-radius: 9px;
          background: var(--surface); color: var(--text); font: inherit;
        }
      `}</style>
    </>
  );
}
