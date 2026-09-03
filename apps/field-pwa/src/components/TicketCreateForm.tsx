import { useEffect, useMemo, useRef, useState } from 'react';
import { createFieldTicket, type NewTicketInput } from '../db/outbox';
import { localRef } from '../db/pouch';
import { useOnlineStatus, useSyncState } from '../hooks/useOnlineStatus';
import './ticket-form.css';

type TicketType = NewTicketInput['ticketType'];
type Urgency = NewTicketInput['urgency'];

interface RefSite { id: string; _id: string; type: 'site'; code: string; name: string }
interface RefEquipment { id: string; _id: string; type: 'equipment'; assetTag: string; qrPayload?: string; name: string; meterKind: 'HEURES' | 'KM' | 'NONE'; currentMeter: number; siteId?: string | null }

interface Props {
  reporterId: string;
  /** pré-sélection si l'utilisateur a scanné un QR juste avant */
  scannedQrPayload?: string;
  /** id engin résolu par le scan (prioritaire sur le rapprochement par qrPayload) */
  preselectedEquipmentId?: string;
  onCreated?: (r: { _id: string; clientId: string }) => void;
}

const TYPE_LABEL: Record<TicketType, string> = {
  PANNE_CRITIQUE: 'Panne critique',
  MAINTENANCE_PREVENTIVE: 'Maintenance préventive',
  DEMANDE_PIECE: 'Demande de pièce',
};
const URGENCY_LABEL: Record<Urgency, { txt: string; hint: string }> = {
  N1_BLOQUANT: { txt: 'N1 — Bloquant', hint: 'Chantier à l’arrêt' },
  N2_MAJEUR: { txt: 'N2 — Majeur', hint: 'Gêne forte, contournable' },
  N3_MINEUR: { txt: 'N3 — Mineur', hint: 'À planifier' },
};

export function TicketCreateForm({ reporterId, scannedQrPayload, preselectedEquipmentId, onCreated }: Props) {
  const online = useOnlineStatus();
  const sync = useSyncState();

  const [sites, setSites] = useState<RefSite[]>([]);
  const [equipments, setEquipments] = useState<RefEquipment[]>([]);

  const [ticketType, setTicketType] = useState<TicketType>('PANNE_CRITIQUE');
  const [urgency, setUrgency] = useState<Urgency>('N1_BLOQUANT');
  const [siteId, setSiteId] = useState('');
  const [equipmentId, setEquipmentId] = useState<string | ''>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [meterValue, setMeterValue] = useState<string>('');
  const [photos, setPhotos] = useState<{ id: string; blob: Blob; url: string }[]>([]);
  const [voiceNote, setVoiceNote] = useState<{ blob: Blob; url: string } | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);

  // ── chargement du référentiel local (fonctionne hors ligne) ──────────
  useEffect(() => {
    localRef.allDocs({ include_docs: true }).then((res) => {
      const docs = res.rows.map((r) => r.doc as any).filter(Boolean);
      setSites(docs.filter((d) => d.type === 'site'));
      setEquipments(docs.filter((d) => d.type === 'equipment'));
    });
  }, []);

  // pré-sélection via scan QR : par id résolu en priorité, sinon rapprochement qrPayload/assetTag
  useEffect(() => {
    if (!equipments.length) return;
    const eq =
      (preselectedEquipmentId && equipments.find((e) => e.id === preselectedEquipmentId || e._id === preselectedEquipmentId)) ||
      (scannedQrPayload &&
        equipments.find(
          (e) => e.qrPayload === scannedQrPayload || e.assetTag === scannedQrPayload,
        ));
    if (eq) {
      setEquipmentId(eq.id);
      if (eq.siteId) setSiteId(eq.siteId);
    }
  }, [scannedQrPayload, preselectedEquipmentId, equipments]);

  // géoloc best-effort, non bloquante
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setGeo({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setGeo(null),
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 60000 },
    );
  }, []);

  const selectedEquipment = useMemo(
    () => equipments.find((e) => e.id === equipmentId) ?? null,
    [equipments, equipmentId],
  );
  const meterKind = selectedEquipment?.meterKind ?? 'NONE';
  const needsMeter = meterKind !== 'NONE' && ticketType !== 'DEMANDE_PIECE';
  const needsEquipment = ticketType !== 'DEMANDE_PIECE';

  const canSubmit =
    !!siteId && title.trim().length >= 3 && (!needsEquipment || !!equipmentId) && !submitting;

  // ── capture photo (input capture = ouvre l'appareil photo natif) ────
  function onPhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const next = files.map((f) => ({ id: crypto.randomUUID(), blob: f, url: URL.createObjectURL(f) }));
    setPhotos((p) => [...p, ...next].slice(0, 6));
    e.target.value = '';
  }
  function removePhoto(id: string) {
    setPhotos((p) => {
      const gone = p.find((x) => x.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return p.filter((x) => x.id !== id);
    });
  }

  // ── note vocale ────────────────────────────────────────────────────
  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (ev) => chunks.push(ev.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        setVoiceNote({ blob, url: URL.createObjectURL(blob) });
        setRecording(false);
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Micro indisponible");
    }
  }

  // ── soumission : écrit dans PouchDB, la synchro se fera seule ───────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const media: NewTicketInput['media'] = [
        ...photos.map((p) => ({ blob: p.blob, kind: 'PHOTO' as const, capturedAt: new Date().toISOString() })),
        ...(voiceNote ? [{ blob: voiceNote.blob, kind: 'VOICE_NOTE' as const }] : []),
      ];
      const result = await createFieldTicket({
        ticketType,
        urgency,
        title,
        description,
        siteId,
        equipmentId: needsEquipment ? equipmentId || null : null,
        qrPayload: scannedQrPayload,
        meterKind: needsMeter ? (meterKind as any) : 'NONE',
        meterValue: needsMeter && meterValue ? Number(meterValue) : null,
        reporterId,
        geo,
        media,
      });
      // reset
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      if (voiceNote) URL.revokeObjectURL(voiceNote.url);
      setPhotos([]);
      setVoiceNote(null);
      setTitle('');
      setDescription('');
      setMeterValue('');
      onCreated?.(result);
    } catch (err) {
      setError((err as Error).message ?? 'Échec de l’enregistrement local');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="tf" onSubmit={handleSubmit}>
      {/* bandeau connectivité */}
      <div className={`tf-net ${online ? 'is-online' : 'is-offline'}`} role="status">
        {online ? (
          <span>● En ligne{sync.pending > 0 ? ` — ${sync.pending} à synchroniser` : ' — synchro à jour'}</span>
        ) : (
          <span>● Hors ligne — le ticket sera envoyé au retour du réseau</span>
        )}
      </div>

      {/* Type d'intervention */}
      <fieldset className="tf-group">
        <legend>Type</legend>
        <div className="tf-choices">
          {(Object.keys(TYPE_LABEL) as TicketType[]).map((t) => (
            <button
              type="button"
              key={t}
              className={`tf-chip ${ticketType === t ? 'is-selected' : ''}`}
              onClick={() => setTicketType(t)}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Urgence */}
      <fieldset className="tf-group">
        <legend>Urgence</legend>
        <div className="tf-choices tf-choices--stack">
          {(Object.keys(URGENCY_LABEL) as Urgency[]).map((u) => (
            <button
              type="button"
              key={u}
              className={`tf-chip tf-chip--${u} ${urgency === u ? 'is-selected' : ''}`}
              onClick={() => setUrgency(u)}
            >
              <strong>{URGENCY_LABEL[u].txt}</strong>
              <em>{URGENCY_LABEL[u].hint}</em>
            </button>
          ))}
        </div>
      </fieldset>

      {/* Chantier */}
      <label className="tf-field">
        <span>Chantier</span>
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)} required>
          <option value="">— Sélectionner —</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} · {s.name}
            </option>
          ))}
        </select>
      </label>

      {/* Matériel */}
      {needsEquipment && (
        <label className="tf-field">
          <span>Matériel {scannedQrPayload && <b className="tf-badge">QR scanné</b>}</span>
          <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} required>
            <option value="">— Sélectionner —</option>
            {equipments
              .filter((e) => !siteId || !e.siteId || e.siteId === siteId)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.assetTag} · {e.name}
                </option>
              ))}
          </select>
        </label>
      )}

      {/* Index compteur */}
      {needsMeter && (
        <label className="tf-field">
          <span>Index compteur ({meterKind === 'HEURES' ? 'heures moteur' : 'km'})</span>
          <input
            type="number"
            inputMode="decimal"
            min={selectedEquipment?.currentMeter ?? 0}
            placeholder={selectedEquipment ? `≥ ${selectedEquipment.currentMeter}` : ''}
            value={meterValue}
            onChange={(e) => setMeterValue(e.target.value)}
          />
        </label>
      )}

      {/* Titre + description */}
      <label className="tf-field">
        <span>Objet</span>
        <input
          type="text"
          value={title}
          maxLength={140}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Fuite hydraulique flèche"
          required
        />
      </label>
      <label className="tf-field">
        <span>Détails (optionnel)</span>
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>

      {/* Médias */}
      <fieldset className="tf-group">
        <legend>Photos & audio</legend>
        <div className="tf-media-actions">
          <button type="button" className="tf-btn tf-btn--ghost" onClick={() => cameraInputRef.current?.click()}>
            📷 Photo
          </button>
          <button
            type="button"
            className={`tf-btn tf-btn--ghost ${recording ? 'is-recording' : ''}`}
            onClick={toggleRecording}
          >
            {recording ? '■ Stop' : '🎙️ Note vocale'}
          </button>
        </div>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={onPhotoPicked}
        />
        {photos.length > 0 && (
          <div className="tf-thumbs">
            {photos.map((p) => (
              <div key={p.id} className="tf-thumb">
                <img src={p.url} alt="" />
                <button type="button" onClick={() => removePhoto(p.id)} aria-label="Supprimer">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {voiceNote && (
          <div className="tf-voice">
            <audio controls src={voiceNote.url} />
            <button type="button" onClick={() => setVoiceNote(null)}>
              Supprimer
            </button>
          </div>
        )}
      </fieldset>

      {error && <p className="tf-error">{error}</p>}

      <button type="submit" className="tf-btn tf-btn--primary" disabled={!canSubmit}>
        {submitting ? 'Enregistrement…' : online ? 'Envoyer le ticket' : 'Enregistrer (hors ligne)'}
      </button>
      <p className="tf-hint">
        Le ticket est d’abord stocké sur l’appareil. Il part automatiquement dès qu’une connexion est disponible —
        vous pouvez fermer l’application sans risque de perte.
      </p>
    </form>
  );
}
