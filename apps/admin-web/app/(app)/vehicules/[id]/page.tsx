'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, endpoints, type VehicleDetail } from '@/lib/api';
import { date, datetime, money, echeance } from '@/lib/format';

const errMsg = (e: unknown) =>
  e instanceof ApiError && e.body && typeof e.body === 'object'
    ? ((e.body as any).message ?? (e.body as any).error ?? 'Erreur')
    : (e as Error).message;

const inp: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', font: 'inherit', width: '100%' };
const km = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n).toLocaleString('fr-FR')} km`);

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: v, isLoading } = useQuery({ queryKey: ['vehicle', id], queryFn: () => endpoints.vehicle(id), refetchInterval: 20_000 });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['vehicle', id] }); qc.invalidateQueries({ queryKey: ['vehicles'] }); };
  const [err, setErr] = useState<string | null>(null);

  const [edit, setEdit] = useState(false);
  const [ef, setEf] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => endpoints.updateVehicle(id, {
      plate: ef.plate, brand: ef.brand || null, model: ef.model || null, year: ef.year ? Number(ef.year) : null,
      category: ef.category || null, fuel: ef.fuel || null,
      assignedName: ef.assignedName || null, assignedFunction: ef.assignedFunction || null,
      serviceIntervalKm: ef.serviceIntervalKm ? Number(ef.serviceIntervalKm) : undefined,
    }),
    onSuccess: () => { refresh(); setEdit(false); setErr(null); },
    onError: (e) => setErr(errMsg(e)),
  });
  const toggleActive = useMutation({ mutationFn: () => endpoints.updateVehicle(id, { active: !v!.active }), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: () => endpoints.deleteVehicle(id),
    onSuccess: () => router.push('/vehicules'),
    onError: (e) => setErr(errMsg(e)),
  });

  const add = useMutation({
    mutationFn: ({ kind, body }: { kind: 'insurance' | 'inspection' | 'odometer' | 'service'; body: unknown }) => endpoints.addVehicleRecord(id, kind, body),
    onSuccess: refresh,
    onError: (e) => setErr(errMsg(e)),
  });
  const delRec = useMutation({
    mutationFn: ({ kind, rid }: { kind: string; rid: string }) => endpoints.deleteVehicleRecord(kind, rid),
    onSuccess: refresh,
  });

  if (isLoading || !v) return <p className="muted">Chargement…</p>;

  const openEdit = () => {
    setEf({
      plate: v.plate, brand: v.brand ?? '', model: v.model ?? '', year: v.year ? String(v.year) : '',
      category: v.category ?? '', fuel: v.fuel ?? '', assignedName: v.assignedName ?? '', assignedFunction: v.assignedFunction ?? '',
      serviceIntervalKm: String(v.serviceIntervalKm),
    });
    setEdit(true);
  };
  const es = (k: string, val: string) => setEf((p) => ({ ...p, [k]: val }));

  const ins = echeance(v.insuranceDaysLeft);
  const insp = echeance(v.inspectionDaysLeft);

  return (
    <>
      <div className="shell-head">
        <div>
          <button className="btn btn-ghost" onClick={() => router.push('/vehicules')} style={{ padding: '4px 10px', fontSize: 13 }}>← Véhicules</button>
          <h1 style={{ marginTop: 8 }}>{v.plate}</h1>
          <p className="muted">{[v.brand, v.model, v.year].filter(Boolean).join(' ') || '—'} · {v.reference}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!v.active && <span className="badge tone-muted">Inactif</span>}
          {!edit && <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 13 }} onClick={openEdit}>Modifier</button>}
          {!edit && <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => toggleActive.mutate()}>{v.active ? 'Désactiver' : 'Réactiver'}</button>}
          {!edit && <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 13, color: 'var(--tone-critical)' }} onClick={() => { if (confirm(`Supprimer le véhicule ${v.plate} ?`)) remove.mutate(); }}>Supprimer</button>}
        </div>
      </div>

      {err && <p className="card" style={{ color: 'var(--tone-critical)', margin: '0 0 14px' }}>{err}</p>}

      {edit && (
        <form className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, alignItems: 'end', marginBottom: 16 }}
          onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          {[['plate', 'Immatriculation'], ['brand', 'Marque'], ['model', 'Modèle'], ['year', 'Année'], ['category', 'Catégorie'], ['fuel', 'Carburant'], ['assignedName', 'Agent affecté'], ['assignedFunction', 'Fonction de l’agent'], ['serviceIntervalKm', 'Périodicité vidange (km)']].map(([k, lab]) => (
            <label key={k} className="fld"><span>{lab}</span><input value={ef[k] ?? ''} onChange={(e) => es(k, e.target.value)} /></label>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={save.isPending}>Enregistrer</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEdit(false)}>Annuler</button>
          </div>
          <style jsx>{`.fld{display:flex;flex-direction:column;gap:5px}.fld>span{font-size:12px;font-weight:700;color:var(--muted)}.fld input{padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--text);font:inherit}`}</style>
        </form>
      )}

      <div className="grid grid-2">
        <div>
          <div className="card">
            <h2>Fiche véhicule</h2>
            <table>
              <tbody>
                <tr><th>Agent affecté</th><td>{v.assignedName ?? '—'}{v.assignedFunction ? ` · ${v.assignedFunction}` : ''}</td></tr>
                <tr><th>Catégorie / carburant</th><td>{[v.category, v.fuel].filter(Boolean).join(' · ') || '—'}</td></tr>
                <tr><th>Kilométrage actuel</th><td><strong>{km(v.currentKm)}</strong></td></tr>
                <tr><th>Prochaine vidange</th><td>{v.nextServiceKm != null ? `${km(v.nextServiceKm)} — ${v.kmToService != null && v.kmToService <= 0 ? 'dépassée' : `dans ${km(v.kmToService)}`}` : '—'}</td></tr>
                <tr><th>Dernière vidange</th><td>{v.lastServiceAt ? `${date(v.lastServiceAt)} à ${km(v.lastServiceKm)}` : '—'}</td></tr>
                <tr><th>Assurance</th><td>{v.insuranceEndDate ? <><span className={`badge tone-${ins.tone}`}>{ins.text}</span> échéance {date(v.insuranceEndDate)}{v.insurer ? ` — ${v.insurer}` : ''}</> : '—'}</td></tr>
                <tr><th>Visite technique</th><td>{v.inspectionValidUntil ? <><span className={`badge tone-${insp.tone}`}>{insp.text}</span> valide jusqu’au {date(v.inspectionValidUntil)}</> : '—'}</td></tr>
              </tbody>
            </table>
          </div>

          <RecordCard title={`Relevés kilométriques (${v.odometerReadings.length})`}
            cols={['Date', 'Km', 'Par', 'Note', '']}
            rows={v.odometerReadings.map((r) => [date(r.readAt), km(r.km), r.recordedBy?.fullName ?? '—', r.note ?? '—', <DelBtn key="d" onClick={() => delRec.mutate({ kind: 'odometer', rid: r.id })} />])}
            form={<OdoForm onAdd={(b) => add.mutate({ kind: 'odometer', body: b })} pending={add.isPending} />} />

          <RecordCard title={`Vidanges & entretien (${v.services.length})`}
            cols={['Date', 'Type', 'Km', 'Prochaine', 'Garage', 'Coût', '']}
            rows={v.services.map((r) => [date(r.performedAt), r.kind, km(r.km), km(r.nextDueKm), r.garage ?? '—', r.cost != null ? money(r.cost) : '—', <DelBtn key="d" onClick={() => delRec.mutate({ kind: 'service', rid: r.id })} />])}
            form={<ServiceForm defaultNext={v.currentKm + v.serviceIntervalKm} onAdd={(b) => add.mutate({ kind: 'service', body: b })} pending={add.isPending} />} />
        </div>

        <div>
          <RecordCard title={`Assurances (${v.insurances.length})`}
            cols={['Assureur', 'Police', 'Début', 'Échéance', 'Prime', '']}
            rows={v.insurances.map((r) => [r.insurer, r.policyNo ?? '—', r.startDate ? date(r.startDate) : '—', date(r.endDate), r.premium != null ? money(r.premium) : '—', <DelBtn key="d" onClick={() => delRec.mutate({ kind: 'insurance', rid: r.id })} />])}
            form={<InsuranceForm onAdd={(b) => add.mutate({ kind: 'insurance', body: b })} pending={add.isPending} />} />

          <RecordCard title={`Visites techniques (${v.inspections.length})`}
            cols={['Effectuée le', 'Valide jusqu’au', 'Centre', 'Résultat', 'Coût', '']}
            rows={v.inspections.map((r) => [date(r.performedAt), date(r.validUntil), r.center ?? '—', r.result ?? '—', r.cost != null ? money(r.cost) : '—', <DelBtn key="d" onClick={() => delRec.mutate({ kind: 'inspection', rid: r.id })} />])}
            form={<InspectionForm onAdd={(b) => add.mutate({ kind: 'inspection', body: b })} pending={add.isPending} />} />
        </div>
      </div>
    </>
  );
}

function DelBtn({ onClick }: { onClick: () => void }) {
  return <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 12, color: 'var(--tone-critical)' }} onClick={onClick}>✕</button>;
}

function RecordCard({ title, cols, rows, form }: { title: string; cols: string[]; rows: React.ReactNode[][]; form: React.ReactNode }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr>{cols.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
          <tbody>
            {!rows.length && <tr><td colSpan={cols.length} className="muted">Aucun enregistrement.</td></tr>}
            {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10 }}>{form}</div>
    </div>
  );
}

const row: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' };

function InsuranceForm({ onAdd, pending }: { onAdd: (b: any) => void; pending: boolean }) {
  const [s, setS] = useState({ insurer: '', policyNo: '', startDate: '', endDate: '', premium: '' });
  return (
    <div style={row}>
      <input placeholder="Assureur" style={{ ...inp, width: 140 }} value={s.insurer} onChange={(e) => setS({ ...s, insurer: e.target.value })} />
      <input placeholder="N° police" style={{ ...inp, width: 110 }} value={s.policyNo} onChange={(e) => setS({ ...s, policyNo: e.target.value })} />
      <label style={{ fontSize: 11, color: 'var(--muted)' }}>début <input type="date" style={{ ...inp, width: 140 }} value={s.startDate} onChange={(e) => setS({ ...s, startDate: e.target.value })} /></label>
      <label style={{ fontSize: 11, color: 'var(--muted)' }}>échéance <input type="date" style={{ ...inp, width: 140 }} value={s.endDate} onChange={(e) => setS({ ...s, endDate: e.target.value })} /></label>
      <input placeholder="Prime" type="number" style={{ ...inp, width: 90 }} value={s.premium} onChange={(e) => setS({ ...s, premium: e.target.value })} />
      <button className="btn" disabled={pending || !s.insurer || !s.endDate} onClick={() => { onAdd({ insurer: s.insurer, policyNo: s.policyNo || null, startDate: s.startDate || null, endDate: s.endDate, premium: s.premium ? Number(s.premium) : null }); setS({ insurer: '', policyNo: '', startDate: '', endDate: '', premium: '' }); }}>Ajouter</button>
    </div>
  );
}

function InspectionForm({ onAdd, pending }: { onAdd: (b: any) => void; pending: boolean }) {
  const [s, setS] = useState({ performedAt: '', validUntil: '', center: '', result: 'FAVORABLE', cost: '' });
  return (
    <div style={row}>
      <label style={{ fontSize: 11, color: 'var(--muted)' }}>effectuée <input type="date" style={{ ...inp, width: 140 }} value={s.performedAt} onChange={(e) => setS({ ...s, performedAt: e.target.value })} /></label>
      <label style={{ fontSize: 11, color: 'var(--muted)' }}>valide jusqu’au <input type="date" style={{ ...inp, width: 140 }} value={s.validUntil} onChange={(e) => setS({ ...s, validUntil: e.target.value })} /></label>
      <input placeholder="Centre" style={{ ...inp, width: 120 }} value={s.center} onChange={(e) => setS({ ...s, center: e.target.value })} />
      <select style={{ ...inp, width: 130 }} value={s.result} onChange={(e) => setS({ ...s, result: e.target.value })}><option>FAVORABLE</option><option>CONTRE_VISITE</option><option>DEFAVORABLE</option></select>
      <input placeholder="Coût" type="number" style={{ ...inp, width: 90 }} value={s.cost} onChange={(e) => setS({ ...s, cost: e.target.value })} />
      <button className="btn" disabled={pending || !s.performedAt || !s.validUntil} onClick={() => { onAdd({ performedAt: s.performedAt, validUntil: s.validUntil, center: s.center || null, result: s.result, cost: s.cost ? Number(s.cost) : null }); setS({ performedAt: '', validUntil: '', center: '', result: 'FAVORABLE', cost: '' }); }}>Ajouter</button>
    </div>
  );
}

function OdoForm({ onAdd, pending }: { onAdd: (b: any) => void; pending: boolean }) {
  const [s, setS] = useState({ km: '', note: '' });
  return (
    <div style={row}>
      <input placeholder="Km relevé" type="number" style={{ ...inp, width: 120 }} value={s.km} onChange={(e) => setS({ ...s, km: e.target.value })} />
      <input placeholder="Note (optionnel)" style={{ ...inp, width: 200 }} value={s.note} onChange={(e) => setS({ ...s, note: e.target.value })} />
      <button className="btn" disabled={pending || !s.km} onClick={() => { onAdd({ km: Number(s.km), note: s.note || null }); setS({ km: '', note: '' }); }}>Enregistrer le relevé</button>
    </div>
  );
}

function ServiceForm({ onAdd, pending, defaultNext }: { onAdd: (b: any) => void; pending: boolean; defaultNext: number }) {
  const [s, setS] = useState({ kind: 'VIDANGE', performedAt: '', km: '', nextDueKm: '', garage: '', cost: '' });
  return (
    <div style={row}>
      <select style={{ ...inp, width: 110 }} value={s.kind} onChange={(e) => setS({ ...s, kind: e.target.value })}><option>VIDANGE</option><option>REVISION</option><option>PNEUS</option><option>FREINS</option><option>AUTRE</option></select>
      <label style={{ fontSize: 11, color: 'var(--muted)' }}>date <input type="date" style={{ ...inp, width: 140 }} value={s.performedAt} onChange={(e) => setS({ ...s, performedAt: e.target.value })} /></label>
      <input placeholder="Km" type="number" style={{ ...inp, width: 90 }} value={s.km} onChange={(e) => setS({ ...s, km: e.target.value })} />
      <input placeholder={`Prochaine (${Math.round(defaultNext)})`} type="number" style={{ ...inp, width: 120 }} value={s.nextDueKm} onChange={(e) => setS({ ...s, nextDueKm: e.target.value })} />
      <input placeholder="Garage" style={{ ...inp, width: 110 }} value={s.garage} onChange={(e) => setS({ ...s, garage: e.target.value })} />
      <input placeholder="Coût" type="number" style={{ ...inp, width: 90 }} value={s.cost} onChange={(e) => setS({ ...s, cost: e.target.value })} />
      <button className="btn" disabled={pending || !s.performedAt || !s.km} onClick={() => { onAdd({ kind: s.kind, performedAt: s.performedAt, km: Number(s.km), nextDueKm: s.nextDueKm ? Number(s.nextDueKm) : null, garage: s.garage || null, cost: s.cost ? Number(s.cost) : null }); setS({ kind: 'VIDANGE', performedAt: '', km: '', nextDueKm: '', garage: '', cost: '' }); }}>Ajouter</button>
    </div>
  );
}
