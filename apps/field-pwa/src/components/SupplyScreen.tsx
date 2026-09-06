import { useEffect, useRef, useState } from 'react';
import { listSupply, submitSupplyControl, type SupplyRow } from '../db/pouch';
import { downscaleImage } from '../lib/image';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import './supply.css';

const STATUS_LABEL: Record<string, string> = {
  DEMANDEE: 'Demandée',
  A_MODIFIER: 'Modification demandée',
  VALIDEE: 'Validée — BC généré',
  RECUE: 'Réception confirmée',
  CLOTUREE: 'Contrôlée & clôturée',
  ANNULEE: 'Annulée',
};
const STATUS_TONE: Record<string, string> = {
  DEMANDEE: 'wait', A_MODIFIER: 'warn', VALIDEE: 'ok', RECUE: 'ok', CLOTUREE: 'done', ANNULEE: 'muted',
};
const CAN_CONTROL = ['CONTROLEUR', 'PARK_MANAGER', 'ADMIN'];

const fmt = (s?: string) =>
  s ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(s)) : '';

function blobToB64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => {
      const s = String(fr.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    fr.readAsDataURL(blob);
  });
}

export function SupplyScreen({ role }: { role: string }) {
  const online = useOnlineStatus();
  const [rows, setRows] = useState<SupplyRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [control, setControl] = useState<SupplyRow | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await listSupply());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const isController = CAN_CONTROL.includes(role);

  if (control) {
    return <ControlForm req={control} onDone={() => { setControl(null); load(); }} onCancel={() => setControl(null)} />;
  }

  return (
    <div className="sp">
      <div className="sp-head">
        <span className={online ? 'sp-on' : 'sp-off'}>{online ? '● à jour' : '● hors ligne'}</span>
        <button className="sp-refresh" onClick={load} disabled={loading}>{loading ? '…' : '↻ Actualiser'}</button>
      </div>

      {rows === null && <p className="sp-empty">Chargement…</p>}
      {rows && !rows.length && <p className="sp-empty">Aucune demande d’approvisionnement.</p>}

      <ul className="sp-list">
        {rows?.map((r) => (
          <li key={r.id} className="sp-item">
            <div className="sp-row1">
              <strong>{r.reference}</strong>
              <span className={`sp-badge tone-${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
            </div>
            <div className="sp-title">{r.title}</div>
            <div className="sp-meta">
              {r.site?.name}{r._count?.items ? ` · ${r._count.items} article(s)` : ''}
              {r.purchaseOrderRef ? ` · BC ${r.purchaseOrderRef}` : ''}
            </div>
            <div className="sp-date">{fmt(r.createdAt)}{r.requester?.fullName ? ` · ${r.requester.fullName}` : ''}</div>
            {isController && r.status === 'RECUE' && (
              <button className="sp-control" onClick={() => setControl(r)}>🔎 Contrôle — vérifier l’installation</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ControlForm({ req, onDone, onCancel }: { req: SupplyRow; onDone: () => void; onCancel: () => void }) {
  const [photos, setPhotos] = useState<{ id: string; blob: Blob; url: string }[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const room = 3 - photos.length;
    if (room <= 0) return;
    const next = await Promise.all(
      files.slice(0, room).map(async (f) => {
        const blob = await downscaleImage(f);
        return { id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob) };
      }),
    );
    setPhotos((p) => [...p, ...next].slice(0, 3));
  }

  async function submit() {
    if (photos.length < 1) { setErr('Prenez au moins 1 photo.'); return; }
    setBusy(true);
    setErr(null);
    const payload = {
      note: note.trim() || undefined,
      photos: await Promise.all(photos.map(async (p) => ({ mimeType: p.blob.type || 'image/jpeg', dataBase64: await blobToB64(p.blob) }))),
    };
    const res = await submitSupplyControl(req.id, payload);
    setBusy(false);
    if (res.ok) {
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      onDone();
    } else {
      setErr(res.error ?? 'Échec');
    }
  }

  return (
    <div className="sp sp-form">
      <button className="app-back" onClick={onCancel}>← Annuler</button>
      <h2 style={{ padding: '4px 16px 0', fontSize: 18 }}>Contrôle · {req.reference}</h2>
      <p className="sp-meta" style={{ padding: '0 16px' }}>{req.title} — {req.site?.name}</p>

      <div className="sp-body">
        <p className="sp-hint">Vérifiez que le matériel demandé est bien installé, puis prenez 1 à 3 photos.</p>

        <button type="button" className="sp-photo-btn" disabled={photos.length >= 3} onClick={() => fileRef.current?.click()}>
          📷 {photos.length >= 3 ? 'Photos (3/3)' : `Photo (${photos.length}/3)`}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />

        {photos.length > 0 && (
          <div className="sp-thumbs">
            {photos.map((p) => (
              <div key={p.id} className="sp-thumb">
                <img src={p.url} alt="" />
                <button type="button" onClick={() => setPhotos((x) => x.filter((y) => y.id !== p.id))}>✕</button>
              </div>
            ))}
          </div>
        )}

        <label className="sp-note">
          <span>Observation (optionnel)</span>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex : matériel installé conforme au 2e étage" />
        </label>

        {err && <p className="sp-error">⚠ {err}</p>}

        <button className="sp-validate" disabled={busy || photos.length < 1} onClick={submit}>
          {busy ? 'Envoi…' : '✓ Valider le contrôle et clôturer'}
        </button>
      </div>
    </div>
  );
}
