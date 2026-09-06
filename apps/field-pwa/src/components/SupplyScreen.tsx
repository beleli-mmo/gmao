import { useEffect, useRef, useState } from 'react';
import {
  listSupply, submitSupplyControl, createSupply, updateSupply, confirmSupplyReception, getSupply, listRefSites,
  type SupplyRow, type RefSite,
} from '../db/pouch';
import { downscaleImage } from '../lib/image';
import { shareSupplyToWhatsApp, type SupplyShare } from '../lib/share';
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
const CAN_CREATE = ['FIELD_MANAGER', 'ADMIN'];

const fmt = (s?: string) =>
  s ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(s)) : '';

function blobToB64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => { const s = String(fr.result); resolve(s.slice(s.indexOf(',') + 1)); };
    fr.readAsDataURL(blob);
  });
}

interface EditInit { editId: string; siteId: string; title: string; needBy: string; note: string; lines: Line[] }
type View =
  | { name: 'list' }
  | { name: 'new'; init?: EditInit }
  | { name: 'sent'; da: SupplyShare }
  | { name: 'control'; req: SupplyRow };

export function SupplyScreen({ role }: { role: string }) {
  const online = useOnlineStatus();
  const [rows, setRows] = useState<SupplyRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>({ name: 'list' });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { setRows(await listSupply()); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const isController = CAN_CONTROL.includes(role);
  const canCreate = CAN_CREATE.includes(role);

  async function receive(id: string) {
    setBusyId(id);
    const r = await confirmSupplyReception(id);
    setBusyId(null);
    if (r.ok) load();
    else alert(r.error);
  }

  async function openEdit(row: SupplyRow) {
    setBusyId(row.id);
    const d = await getSupply(row.id);
    setBusyId(null);
    if (!d) { alert('Impossible de charger la demande.'); return; }
    setView({
      name: 'new',
      init: {
        editId: d.id,
        siteId: d.site?.id ?? '',
        title: d.title,
        needBy: d.needBy ? d.needBy.slice(0, 10) : '',
        note: d.note ?? '',
        lines: d.items.length ? d.items.map((i) => ({ label: i.label, qty: String(i.quantity), unit: i.unit })) : [emptyLine()],
      },
    });
  }

  if (view.name === 'control') {
    return <ControlForm req={view.req} onDone={() => { setView({ name: 'list' }); load(); }} onCancel={() => setView({ name: 'list' })} />;
  }
  if (view.name === 'new') {
    return <NewForm init={view.init} onCancel={() => setView({ name: 'list' })} onSent={(da) => { setView({ name: 'sent', da }); load(); }} />;
  }
  if (view.name === 'sent') {
    const da = view.da;
    return (
      <div className="sp sp-form">
        <div className="sp-body" style={{ textAlign: 'center', gap: 14 }}>
          <div className="sp-check">✓</div>
          <h2 style={{ margin: 0 }}>Demande envoyée</h2>
          <p className="sp-ref">{da.reference}</p>
          <p className="sp-hint">Elle est arrivée au bureau pour validation par le directeur technique.</p>
          <button className="sp-wa" onClick={() => shareSupplyToWhatsApp(da)}>
            <svg viewBox="0 0 32 32" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M16 3C9 3 3.5 8.5 3.5 15.5c0 2.4.7 4.7 1.9 6.7L3 29l7-1.8c1.9 1 4 1.6 6 1.6 7 0 12.5-5.5 12.5-12.5S23 3 16 3zm0 22.8c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-4.2 1.1 1.1-4.1-.3-.4c-1-1.6-1.6-3.5-1.6-5.4C5.1 9.6 10 4.9 16 4.9c6 0 10.9 4.7 10.9 10.6S22 25.8 16 25.8zm6-7.9c-.3-.2-1.9-1-2.2-1.1-.3-.1-.5-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.3-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.3.4-.6.1-.2.1-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.8-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.2-1.2 2.9 0 1.7 1.2 3.3 1.4 3.6.2.2 2.4 3.7 5.9 5.1 3.5 1.4 3.5.9 4.1.9.7-.1 1.9-.8 2.2-1.6.3-.8.3-1.4.2-1.6-.1-.1-.3-.2-.6-.4z"/></svg>
            Partager sur WhatsApp
          </button>
          <button className="sp-validate" style={{ background: '#1b222b' }} onClick={() => setView({ name: 'list' })}>Terminé</button>
        </div>
      </div>
    );
  }

  return (
    <div className="sp">
      <div className="sp-head">
        <span className={online ? 'sp-on' : 'sp-off'}>{online ? '● à jour' : '● hors ligne'}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="sp-refresh" onClick={load} disabled={loading}>{loading ? '…' : '↻'}</button>
          {canCreate && <button className="sp-new" onClick={() => setView({ name: 'new' })}>+ Nouvelle demande</button>}
        </div>
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

            {canCreate && r.status === 'A_MODIFIER' && (
              <>
                {r.reviewNote && <p className="sp-review">✏️ Modification demandée : {r.reviewNote}</p>}
                <button className="sp-control" style={{ background: '#b7791f' }} disabled={busyId === r.id} onClick={() => openEdit(r)}>
                  {busyId === r.id ? '…' : '✏️ Modifier et renvoyer'}
                </button>
              </>
            )}
            {canCreate && r.status === 'VALIDEE' && (
              <button className="sp-control" disabled={busyId === r.id} onClick={() => receive(r.id)}>
                {busyId === r.id ? '…' : '✓ Confirmer la réception du matériel'}
              </button>
            )}
            {isController && r.status === 'RECUE' && (
              <button className="sp-control" onClick={() => setView({ name: 'control', req: r })}>🔎 Contrôle — vérifier l’installation</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────  NOUVELLE DEMANDE  ─────────────────────────────
type Line = { label: string; qty: string; unit: string };
const emptyLine = (): Line => ({ label: '', qty: '1', unit: 'U' });

function NewForm({ init, onCancel, onSent }: { init?: EditInit; onCancel: () => void; onSent: (da: SupplyShare) => void }) {
  const editId = init?.editId;
  const [sites, setSites] = useState<RefSite[]>([]);
  const [siteId, setSiteId] = useState(init?.siteId ?? '');
  const [title, setTitle] = useState(init?.title ?? '');
  const [needBy, setNeedBy] = useState(init?.needBy ?? '');
  const [note, setNote] = useState(init?.note ?? '');
  const [lines, setLines] = useState<Line[]>(init?.lines ?? [emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const online = useOnlineStatus();

  useEffect(() => { listRefSites().then(setSites); }, []);
  const setLine = (i: number, k: keyof Line, v: string) => setLines((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const validLines = lines.filter((l) => l.label.trim());
  const canSend = online && siteId && title.trim().length >= 3 && validLines.length >= 1 && !busy;

  async function send() {
    setBusy(true);
    setErr(null);
    const items = validLines.map((l) => ({ label: l.label.trim(), quantity: Number(l.qty || 1), unit: l.unit.trim() || 'U' }));
    const payload = { siteId, title: title.trim(), note: note.trim() || undefined, needBy: needBy || undefined, items };
    const res = editId ? await updateSupply(editId, payload) : await createSupply(payload);
    setBusy(false);
    if (res.ok) {
      const reference = (res as any).data?.reference ?? '';
      onSent({ reference, title: title.trim(), siteName: sites.find((s) => s.id === siteId)?.name, needBy: needBy || null, note: note.trim() || undefined, items });
    } else {
      setErr(res.error ?? 'Échec de l’envoi');
    }
  }

  return (
    <div className="sp sp-form">
      <button className="app-back" onClick={onCancel}>← Annuler</button>
      <h2 style={{ padding: '4px 16px 0', fontSize: 18 }}>Nouvelle demande d’approvisionnement</h2>

      <div className="sp-body">
        {!online && <p className="sp-error">● Hors ligne — connectez-vous pour envoyer.</p>}

        <label className="sp-note"><span>Chantier</span>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">— Sélectionner —</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="sp-note"><span>Objet de la demande</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : matériel électrique 2e étage" />
        </label>
        <label className="sp-note"><span>Besoin pour le (optionnel)</span>
          <input type="date" value={needBy} onChange={(e) => setNeedBy(e.target.value)} />
        </label>

        <div>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#6b7480' }}>ARTICLES</span>
          {lines.map((l, i) => (
            <div key={i} className="sp-line">
              <input placeholder="Désignation" value={l.label} onChange={(e) => setLine(i, 'label', e.target.value)} />
              <input type="number" min="0" step="any" placeholder="Qté" value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} />
              <input placeholder="Unité" value={l.unit} onChange={(e) => setLine(i, 'unit', e.target.value)} />
              <button type="button" onClick={() => setLines((p) => p.filter((_, j) => j !== i))} disabled={lines.length === 1}>✕</button>
            </div>
          ))}
          <button type="button" className="sp-addline" onClick={() => setLines((p) => [...p, emptyLine()])}>+ Ajouter un article</button>
        </div>

        <label className="sp-note"><span>Note (optionnel)</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {err && <p className="sp-error">⚠ {err}</p>}
        <button className="sp-validate" disabled={!canSend} onClick={send}>{busy ? 'Envoi…' : 'Envoyer la demande'}</button>
      </div>
    </div>
  );
}

// ─────────────────────────────  CONTRÔLE TERRAIN  ─────────────────────────────
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
    if (res.ok) { photos.forEach((p) => URL.revokeObjectURL(p.url)); onDone(); }
    else setErr(res.error ?? 'Échec');
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
