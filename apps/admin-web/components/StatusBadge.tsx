'use client';

import type { EquipmentStatus, TicketStatus, Urgency } from '@/lib/api';
import { EQUIPMENT_STATUS_LABEL, TICKET_STATUS_LABEL, URGENCY_LABEL } from '@/lib/format';

/* Couleurs de STATUT réservées (état, pas série) — toujours accompagnées du libellé. */
const TICKET_TONE: Record<TicketStatus, string> = {
  CREE: 'neutral', EN_ATTENTE: 'warning', QUALIFIE: 'info', PLANIFIE: 'info',
  EN_COURS: 'info', TRAVAUX_TERMINES: 'good', VALIDE_TERRAIN: 'good',
  CLOTURE: 'muted', ANNULE: 'muted',
};
const EQUIP_TONE: Record<EquipmentStatus, string> = {
  EN_SERVICE: 'good', EN_PANNE: 'critical', EN_MAINTENANCE: 'warning',
  EN_TRANSIT: 'info', REFORME: 'muted',
};
const URGENCY_TONE: Record<Urgency, string> = {
  N1_BLOQUANT: 'critical', N2_MAJEUR: 'warning', N3_MINEUR: 'neutral',
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`badge tone-${TICKET_TONE[status]}`}>{TICKET_STATUS_LABEL[status]}</span>;
}
export function EquipmentStatusBadge({ status }: { status: EquipmentStatus }) {
  return <span className={`badge tone-${EQUIP_TONE[status]}`}>{EQUIPMENT_STATUS_LABEL[status]}</span>;
}
export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return <span className={`badge tone-${URGENCY_TONE[urgency]}`}>{URGENCY_LABEL[urgency]}</span>;
}
