const xof = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 });
const dt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const dOnly = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

export const money = (n: number | null | undefined) => xof.format(Number(n ?? 0));
export const datetime = (s: string | Date | null | undefined) => (s ? dt.format(new Date(s)) : '—');
export const date = (s: string | Date | null | undefined) => (s ? dOnly.format(new Date(s)) : '—');
export const days = (n: number | null | undefined) =>
  n == null ? '—' : n < 1 ? `${Math.round(n * 24)} h` : `${n} j`;

export const TICKET_STATUS_LABEL: Record<string, string> = {
  CREE: 'DI créée', EN_ATTENTE: 'DI reçue', QUALIFIE: 'OS qualifié', PLANIFIE: 'OS planifié',
  EN_COURS: 'En exécution', TRAVAUX_TERMINES: 'Compte-rendu saisi', VALIDE_TERRAIN: 'Service fait',
  CLOTURE: 'Clôturé', ANNULE: 'Annulé',
};
export const URGENCY_LABEL: Record<string, string> = {
  N1_BLOQUANT: 'P1 · Urgent', N2_MAJEUR: 'P2 · Important', N3_MINEUR: 'P3 · Normal',
};
export const TYPE_LABEL: Record<string, string> = {
  PANNE_CRITIQUE: 'Curatif', MAINTENANCE_PREVENTIVE: 'Préventif', DEMANDE_PIECE: 'Demande de pièce',
};
