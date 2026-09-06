import { useEffect, useState } from 'react';
import { listMyTickets, fetchTicketPhotos, type MyTicket } from '../db/pouch';
import { shareDi } from '../lib/share';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import './my-tickets.css';

const STATUS_LABEL: Record<string, string> = {
  CREE: 'Créée',
  EN_ATTENTE: 'Reçue au bureau',
  ENVOYEE: 'Envoyée',
  QUALIFIE: 'Qualifiée',
  PLANIFIE: 'Planifiée',
  EN_COURS: 'En cours',
  TRAVAUX_TERMINES: 'Travaux terminés',
  VALIDE_TERRAIN: 'Service fait',
  CLOTURE: 'Clôturée',
  ANNULE: 'Annulée',
};
const STATUS_TONE: Record<string, string> = {
  ENVOYEE: 'wait', EN_ATTENTE: 'wait', QUALIFIE: 'progress', PLANIFIE: 'progress',
  EN_COURS: 'progress', TRAVAUX_TERMINES: 'progress', VALIDE_TERRAIN: 'done',
  CLOTURE: 'done', ANNULE: 'muted', CREE: 'wait',
};
const TYPE_LABEL: Record<string, string> = {
  PANNE_CRITIQUE: 'Curatif',
  MAINTENANCE_PREVENTIVE: 'Préventif',
  DEMANDE_PIECE: 'Demande de pièce',
};
const URGENCY_LABEL: Record<string, string> = {
  N1_BLOQUANT: 'P1', N2_MAJEUR: 'P2', N3_MINEUR: 'P3',
};

const fmtDate = (s?: string) =>
  s ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(s)) : '';

export function MyTicketsList() {
  const online = useOnlineStatus();
  const [rows, setRows] = useState<MyTicket[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);

  async function share(t: MyTicket) {
    setSharing(t.reference);
    try {
      const photos = t.photoCount ? await fetchTicketPhotos(t.reference) : [];
      await shareDi({
        reference: t.reference,
        title: t.title,
        type: t.type,
        urgency: t.urgency,
        status: t.status,
        siteName: t.siteName ?? t.siteCode,
        assetName: t.assetName ?? t.assetTag,
        createdAtField: t.createdAtField,
        photos,
      });
    } finally {
      setSharing(null);
    }
  }

  async function load() {
    setLoading(true);
    try {
      setRows(await listMyTickets());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="mt">
      <div className="mt-head">
        <span className={online ? 'mt-on' : 'mt-off'}>{online ? '● à jour' : '● hors ligne — historique local'}</span>
        <button className="mt-refresh" onClick={load} disabled={loading}>
          {loading ? '…' : '↻ Actualiser'}
        </button>
      </div>

      {rows === null && <p className="mt-empty">Chargement…</p>}
      {rows && rows.length === 0 && <p className="mt-empty">Aucune demande envoyée pour l’instant.</p>}

      <ul className="mt-list">
        {rows?.map((t) => (
          <li key={t.reference} className="mt-item">
            <div className="mt-row1">
              <strong>{t.reference}</strong>
              <span className={`mt-badge tone-${STATUS_TONE[t.status] ?? 'wait'}`}>
                {STATUS_LABEL[t.status] ?? t.status}
              </span>
            </div>
            <div className="mt-title">{t.title}</div>
            <div className="mt-meta">
              {URGENCY_LABEL[t.urgency] ?? ''} · {TYPE_LABEL[t.type] ?? t.type}
              {t.assetName || t.assetTag ? ` · ${t.assetName ?? t.assetTag}` : ''}
              {t.siteName || t.siteCode ? ` · ${t.siteName ?? t.siteCode}` : ''}
            </div>
            <div className="mt-date">{fmtDate(t.createdAtField)}{!t.fromServer && ' · en attente de confirmation bureau'}</div>
            <button type="button" className="mt-share" disabled={sharing === t.reference} onClick={() => share(t)}>
              <svg viewBox="0 0 32 32" width="15" height="15" aria-hidden="true" fill="currentColor">
                <path d="M16 3C9 3 3.5 8.5 3.5 15.5c0 2.4.7 4.7 1.9 6.7L3 29l7-1.8c1.9 1 4 1.6 6 1.6 7 0 12.5-5.5 12.5-12.5S23 3 16 3zm0 22.8c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-4.2 1.1 1.1-4.1-.3-.4c-1-1.6-1.6-3.5-1.6-5.4C5.1 9.6 10 4.9 16 4.9c6 0 10.9 4.7 10.9 10.6S22 25.8 16 25.8zm6-7.9c-.3-.2-1.9-1-2.2-1.1-.3-.1-.5-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.3-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.3.4-.6.1-.2.1-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.8-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.2-1.2 2.9 0 1.7 1.2 3.3 1.4 3.6.2.2 2.4 3.7 5.9 5.1.8.3 1.5.6 2 .7.8.3 1.6.2 2.2.1.7-.1 1.9-.8 2.2-1.6.3-.8.3-1.4.2-1.6-.1-.1-.3-.2-.6-.4z"/>
              </svg>
              {sharing === t.reference
                ? 'Préparation…'
                : `Partager sur WhatsApp${t.photoCount ? ` (+${t.photoCount} photo${t.photoCount > 1 ? 's' : ''})` : ''}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
