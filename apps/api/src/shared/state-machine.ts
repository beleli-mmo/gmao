import { Role, TicketStatus } from './enums';

/**
 * Transitions autorisées du workflow ticket + rôle habilité.
 * Utilisé côté API (actions bureau) ET côté worker d'ingestion (actions terrain synchronisées).
 */
type Transition = { from: TicketStatus; to: TicketStatus; roles: Role[] };

export const TICKET_TRANSITIONS: Transition[] = [
  // création terrain : le doc arrive directement en EN_ATTENTE
  { from: TicketStatus.CREE, to: TicketStatus.EN_ATTENTE, roles: [Role.FIELD_MANAGER, Role.ADMIN] },
  { from: TicketStatus.EN_ATTENTE, to: TicketStatus.QUALIFIE, roles: [Role.PARK_MANAGER, Role.ADMIN] },
  { from: TicketStatus.QUALIFIE, to: TicketStatus.PLANIFIE, roles: [Role.PARK_MANAGER, Role.ADMIN] },
  { from: TicketStatus.PLANIFIE, to: TicketStatus.EN_COURS, roles: [Role.MECHANIC, Role.PARK_MANAGER, Role.ADMIN] },
  { from: TicketStatus.EN_COURS, to: TicketStatus.TRAVAUX_TERMINES, roles: [Role.MECHANIC, Role.PARK_MANAGER, Role.ADMIN] },
  { from: TicketStatus.TRAVAUX_TERMINES, to: TicketStatus.VALIDE_TERRAIN, roles: [Role.FIELD_MANAGER, Role.ADMIN] },
  { from: TicketStatus.VALIDE_TERRAIN, to: TicketStatus.CLOTURE, roles: [Role.PARK_MANAGER, Role.ADMIN] },
  // ré-ouverture d'un ticket validé si contestation
  { from: TicketStatus.VALIDE_TERRAIN, to: TicketStatus.EN_COURS, roles: [Role.PARK_MANAGER, Role.ADMIN] },
];

const CANCELLABLE_FROM: TicketStatus[] = [
  TicketStatus.CREE,
  TicketStatus.EN_ATTENTE,
  TicketStatus.QUALIFIE,
  TicketStatus.PLANIFIE,
];

export function canTransition(from: TicketStatus, to: TicketStatus, role: Role): boolean {
  if (to === TicketStatus.ANNULE) {
    const cancelRoles: Role[] = [Role.PARK_MANAGER, Role.ADMIN, Role.FIELD_MANAGER];
    return CANCELLABLE_FROM.includes(from) && cancelRoles.includes(role);
  }
  return TICKET_TRANSITIONS.some((t) => t.from === from && t.to === to && t.roles.includes(role));
}

export function assertTransition(from: TicketStatus, to: TicketStatus, role: Role): void {
  if (!canTransition(from, to, role)) {
    throw Object.assign(new Error(`Transition interdite ${from} → ${to} pour le rôle ${role}`), {
      code: 'ILLEGAL_TRANSITION',
      httpStatus: 409,
    });
  }
}
