'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { ApiError, endpoints } from '@/lib/api';
import { EquipmentStatusBadge, TicketStatusBadge, UrgencyBadge } from '@/components/StatusBadge';
import { CRITICALITY_LABEL, TICKET_TYPE_LABEL, date, datetime, money } from '@/lib/format';

const errMsg = (err: unknown) =>
  err instanceof ApiError && err.body && typeof err.body === 'object'
    ? ((err.body as any).message ?? (err.body as any).error ?? 'Erreur')
    : (err as Error).message;

export default function CarnetDeSantePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: e, isLoading } = useQuery({ queryKey: ['equipment', id], queryFn: () => endpoints.equipment(id) });
  const lots = useQuery({ queryKey: ['lots'], queryFn: () => endpoints.lotsList() });

  const [edit, setEdit] = useState(false);
  const [ef, setEf] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      endpoints.updateEquipment(id, {
        name: ef.name?.trim(),
        lotId: ef.lotId || null,
        zone: ef.zone?.trim() || null,
        criticality: ef.criticality,
        meterKind: ef.meterKind,
        brand: ef.brand?.trim() || null,
        model: ef.model?.trim() || null,
        acquisitionCost: ef.acquisitionCost ? Number(ef.acquisitionCost) : null,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['equipment'] }); setEdit(false); setErr(null); },
    onError: (x) => setErr(errMsg(x)),
  });

  const remove = useMutation({
    mutationFn: () => endpoints.deleteEquipment(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['equipment'] }); router.push('/parc'); },
    onError: (x) => setErr(errMsg(x)),
  });

  if (isLoading || !e) return <p className="muted">Chargement…</p>;

  const openEdit = () => {
    setErr(null);
    setEf({
      name: e.name, lotId: e.lot ? (lots.data?.data.find((l) => l.code === e.lot!.code)?.id ?? '') : '',
      zone: e.zone ?? '', criticality: e.criticality ?? 'STANDARD', meterKind: e.meterKind,
      brand: e.brand ?? '', model: e.model ?? '', acquisitionCost: e.acquisitionCost ? String(e.acquisitionCost) : '',
    });
    setEdit(true);
  };
  const efSet = (k: string, v: string) => setEf((p) => ({ ...p, [k]: v }));

  const preventifs = e.tickets.filter((t) => t.type === 'MAINTENANCE_PREVENTIVE');
  const curatifs = e.tickets.filter((t) => t.type !== 'MAINTENANCE_PREVENTIVE');

  return (
    <>
      <div className="shell-head">
        <div>
          <button className="btn btn-ghost" onClick={() => router.push('/parc')} style={{ padding: '4px 10px', fontSize: 13 }}>← Actifs</button>
          <h1 style={{ marginTop: 8 }}>{e.name}</h1>
          <p className="muted">{e.assetTag}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {e.lot && <span className="badge" style={{ background: `${e.lot.color}22`, color: e.lot.color }}>{e.lot.name}</span>}
          <EquipmentStatusBadge status={e.status} />
          {!edit && <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 13 }} onClick={openEdit}>Modifier</button>}
          {!edit && (
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 13, color: 'var(--tone-critical)' }}
              disabled={remove.isPending}
              onClick={() => { if (confirm(`Supprimer l’actif « ${e.name} » ?`)) remove.mutate(); }}>
              Supprimer
            </button>
          )}
        </div>
      </div>

      {err && <p className="card" style={{ color: 'var(--tone-critical)', margin: '0 0 14px' }}>{err}</p>}

      {edit && (
        <form className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, alignItems: 'end', marginBottom: 16 }}
          onSubmit={(ev) => { ev.preventDefault(); save.mutate(); }}>
          <label className="fld2"><span>Désignation</span><input value={ef.name ?? ''} onChange={(x) => efSet('name', x.target.value)} required /></label>
          <label className="fld2"><span>Lot technique</span>
            <select value={ef.lotId ?? ''} onChange={(x) => efSet('lotId', x.target.value)}>
              <option value="">—</option>
              {lots.data?.data.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label className="fld2"><span>Zone / niveau</span><input value={ef.zone ?? ''} onChange={(x) => efSet('zone', x.target.value)} /></label>
          <label className="fld2"><span>Criticité</span>
            <select value={ef.criticality ?? 'STANDARD'} onChange={(x) => efSet('criticality', x.target.value)}>
              {Object.entries(CRITICALITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="fld2"><span>Compteur</span>
            <select value={ef.meterKind ?? 'NONE'} onChange={(x) => efSet('meterKind', x.target.value)}>
              <option value="NONE">Aucun</option><option value="HEURES">Heures</option><option value="KM">Km</option>
            </select>
          </label>
          <label className="fld2"><span>Marque</span><input value={ef.brand ?? ''} onChange={(x) => efSet('brand', x.target.value)} /></label>
          <label className="fld2"><span>Modèle</span><input value={ef.model ?? ''} onChange={(x) => efSet('model', x.target.value)} /></label>
          <label className="fld2"><span>Valeur d’acquisition</span><input type="number" value={ef.acquisitionCost ?? ''} onChange={(x) => efSet('acquisitionCost', x.target.value)} /></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={save.isPending}>{save.isPending ? '…' : 'Enregistrer'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEdit(false)}>Annuler</button>
          </div>
          <style jsx>{`
            .fld2 { display: flex; flex-direction: column; gap: 5px; }
            .fld2 > span { font-size: 12px; font-weight: 700; color: var(--muted); }
            .fld2 input, .fld2 select { padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; }
          `}</style>
        </form>
      )}

      <div className="grid grid-kpi" style={{ marginBottom: 18 }}>
        <div className="kpi"><span className="kpi-label">Coût de possession cumulé</span><strong className="kpi-value">{money(e.lifetimeCost)}</strong></div>
        <div className="kpi"><span className="kpi-label">DI ouvertes</span><strong className="kpi-value">{e.openTickets}</strong></div>
        <div className="kpi"><span className="kpi-label">Interventions</span><strong className="kpi-value">{e.tickets.length}</strong></div>
        <div className="kpi"><span className="kpi-label">Compteur</span><strong className="kpi-value">{e.meterKind === 'NONE' ? '—' : `${e.currentMeter} ${e.meterKind === 'HEURES' ? 'h' : 'km'}`}</strong></div>
      </div>

      <div className="grid grid-2">
        <div>
          <div className="card">
            <h2>Identification</h2>
            <table>
              <tbody>
                <tr><th>Projet / site</th><td>{e.currentSite ? e.currentSite.name : '—'}</td></tr>
                <tr><th>Zone / niveau</th><td>{e.zone ?? '—'}</td></tr>
                <tr><th>Nature</th><td>{e.kind}</td></tr>
                <tr><th>Criticité</th><td>{CRITICALITY_LABEL[e.criticality ?? 'STANDARD']}</td></tr>
                <tr><th>Marque / modèle</th><td>{[e.brand, e.model].filter(Boolean).join(' ') || '—'}</td></tr>
                <tr><th>N° série</th><td>{e.serialNumber ?? '—'}</td></tr>
                <tr><th>Acquisition</th><td>{e.acquisitionCost ? `${money(e.acquisitionCost)} · ${date(e.acquisitionDate ?? null)}` : '—'}</td></tr>
                <tr><th>QR</th><td><code>{e.qrPayload || `GMAO:${e.assetTag}`}</code></td></tr>
              </tbody>
            </table>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
              <QRCodeSVG value={e.qrPayload || `GMAO:${e.assetTag}`} size={132} level="M" marginSize={2} />
              <div>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>À coller sur l’actif — scannable hors ligne par l’app terrain.</p>
                <Link href="/etiquettes" className="btn btn-ghost" style={{ marginTop: 8, display: 'inline-block' }}>Planche d’étiquettes →</Link>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Plan préventif</h2>
            {e.preventivePlans.length ? (
              <table>
                <thead><tr><th>Opération</th><th>Déclencheur</th><th>Prochaine échéance</th></tr></thead>
                <tbody>
                  {e.preventivePlans.map((p) => (
                    <tr key={p.id}>
                      <td>{p.label}{p.isRegulatory && <span className="badge tone-info" style={{ marginLeft: 6 }}>Réglementaire</span>}</td>
                      <td className="muted">{p.trigger}</td>
                      <td>{p.trigger === 'CALENDAIRE' ? date(p.nextDueDate ?? null) : `${p.nextDueMeter ?? '—'} ${e.meterKind === 'KM' ? 'km' : 'h'}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="muted">Aucun plan préventif défini.</p>}
          </div>

          {e.meterReadings.length > 0 && (
            <div className="card">
              <h2>Relevés compteur</h2>
              <table>
                <thead><tr><th>Date</th><th>Valeur</th><th>Source</th></tr></thead>
                <tbody>
                  {e.meterReadings.slice(0, 8).map((m) => (
                    <tr key={m.id}><td className="muted">{datetime(m.readAt)}</td><td>{m.value} {m.kind === 'KM' ? 'km' : 'h'}</td><td className="muted">{m.source}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <h2>Historique préventif ({preventifs.length})</h2>
            <TicketTable rows={preventifs} showDue />
          </div>
          <div className="card">
            <h2>Historique curatif ({curatifs.length})</h2>
            <TicketTable rows={curatifs} />
          </div>
        </div>
      </div>
    </>
  );
}

function TicketTable({ rows, showDue = false }: { rows: any[]; showDue?: boolean }) {
  if (!rows.length) return <p className="muted">Aucune intervention enregistrée.</p>;
  return (
    <table>
      <thead>
        <tr><th>DI</th><th>Objet</th>{showDue && <th>Échéance</th>}<th>Statut</th><th style={{ textAlign: 'right' }}>Coût</th></tr>
      </thead>
      <tbody>
        {rows.map((t) => {
          const late = showDue && t.dueDate && t.closedAt && new Date(t.closedAt) > new Date(t.dueDate);
          return (
            <tr key={t.id}>
              <td><Link href={`/tickets/${t.id}`}>{t.reference}</Link><div className="muted">{datetime(t.createdAtField)}</div></td>
              <td>{t.title}<div><UrgencyBadge urgency={t.urgency} /></div></td>
              {showDue && <td className={late ? '' : 'muted'} style={late ? { color: 'var(--tone-critical)', fontWeight: 700 } : {}}>{date(t.dueDate)}{late ? ' ⚠' : ''}</td>}
              <td><TicketStatusBadge status={t.status} /></td>
              <td style={{ textAlign: 'right' }}>{t.cost ? money(t.cost) : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
