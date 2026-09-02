import type { CostKind, EquipmentStatus, TicketStatus, Urgency } from './api';

const xof = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 });
export const money = (n: number | null | undefined) => xof.format(Number(n ?? 0));

const dt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
export const datetime = (s: string | Date | null | undefined) => (s ? dt.format(new Date(s)) : '—');
export const date = (s: string | Date | null | undefined) =>
  s ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(s)) : '—';

export function hoursBetween(a: string, b: string) {
  return Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 3_600_000) * 10) / 10;
}

// ── libellés du workflow (procédure : DI → OS/BT → Exécution & CR → Réception & Clôture) ──
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  CREE: 'DI créée',
  EN_ATTENTE: 'DI reçue',
  QUALIFIE: 'OS qualifié',
  PLANIFIE: 'OS planifié',
  EN_COURS: 'En exécution',
  TRAVAUX_TERMINES: 'Compte-rendu saisi',
  VALIDE_TERRAIN: 'Service fait',
  CLOTURE: 'Clôturé',
  ANNULE: 'Annulé',
};

export const TICKET_STATUS_ORDER: TicketStatus[] = [
  'EN_ATTENTE', 'QUALIFIE', 'PLANIFIE', 'EN_COURS', 'TRAVAUX_TERMINES', 'VALIDE_TERRAIN', 'CLOTURE',
];

export const TICKET_TYPE_LABEL: Record<string, string> = {
  PANNE_CRITIQUE: 'Curatif',
  MAINTENANCE_PREVENTIVE: 'Préventif',
  DEMANDE_PIECE: 'Demande de pièce',
};

// Priorité P1/P2/P3 (procédure). Valeurs DB inchangées (N1/N2/N3).
export const URGENCY_LABEL: Record<Urgency, string> = {
  N1_BLOQUANT: 'P1 · Urgent',
  N2_MAJEUR: 'P2 · Important',
  N3_MINEUR: 'P3 · Normal',
};

export const ROLE_LABEL: Record<string, string> = {
  FIELD_MANAGER: 'Responsable de site',
  PARK_MANAGER: 'Responsable technique',
  MECHANIC: 'Technicien',
  ADMIN: 'Administrateur',
};
export const ROLES = ['FIELD_MANAGER', 'PARK_MANAGER', 'MECHANIC', 'ADMIN'] as const;

export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  EN_SERVICE: 'En service',
  EN_PANNE: 'En panne',
  EN_MAINTENANCE: 'En maintenance',
  EN_TRANSIT: 'Consigné',
  REFORME: 'Réformé',
};

export const CRITICALITY_LABEL: Record<string, string> = {
  CRITIQUE: 'Critique',
  IMPORTANT: 'Important',
  STANDARD: 'Standard',
};

/** Palette catégorielle Okabe–Ito (sûre pour tous les types de daltonisme), ordre FIXE. */
export const COST_KIND_LABEL: Record<CostKind, string> = {
  MAIN_OEUVRE: "Main d'œuvre",
  PIECE: 'Pièces',
  FACTURE_EXTERNE: 'Factures externes',
  DEPLACEMENT: 'Déplacement',
};
export const COST_KIND_ORDER: CostKind[] = ['MAIN_OEUVRE', 'PIECE', 'FACTURE_EXTERNE', 'DEPLACEMENT'];
export const COST_KIND_COLOR: Record<CostKind, string> = {
  MAIN_OEUVRE: '#0072B2',
  PIECE: '#E69F00',
  FACTURE_EXTERNE: '#009E73',
  DEPLACEMENT: '#CC79A7',
};
