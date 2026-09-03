import { useEffect, useState } from 'react';
import { listMyTickets, type MyTicket } from '../db/pouch';
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
              {t.assetTag ? ` · ${t.assetTag}` : ''}
              {t.siteCode ? ` · ${t.siteCode}` : ''}
            </div>
            <div className="mt-date">{fmtDate(t.createdAtField)}{!t.fromServer && ' · en attente de confirmation bureau'}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
