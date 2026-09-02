// Enums partagés API ⇄ PWA ⇄ Admin. Miroir des enums Prisma.

export const TicketStatus = {
  CREE: 'CREE',
  EN_ATTENTE: 'EN_ATTENTE',
  QUALIFIE: 'QUALIFIE',
  PLANIFIE: 'PLANIFIE',
  EN_COURS: 'EN_COURS',
  TRAVAUX_TERMINES: 'TRAVAUX_TERMINES',
  VALIDE_TERRAIN: 'VALIDE_TERRAIN',
  CLOTURE: 'CLOTURE',
  ANNULE: 'ANNULE',
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

export const TicketType = {
  PANNE_CRITIQUE: 'PANNE_CRITIQUE',
  MAINTENANCE_PREVENTIVE: 'MAINTENANCE_PREVENTIVE',
  DEMANDE_PIECE: 'DEMANDE_PIECE',
} as const;
export type TicketType = (typeof TicketType)[keyof typeof TicketType];

export const Urgency = {
  N1_BLOQUANT: 'N1_BLOQUANT',
  N2_MAJEUR: 'N2_MAJEUR',
  N3_MINEUR: 'N3_MINEUR',
} as const;
export type Urgency = (typeof Urgency)[keyof typeof Urgency];

export const EquipmentStatus = {
  EN_SERVICE: 'EN_SERVICE',
  EN_PANNE: 'EN_PANNE',
  EN_MAINTENANCE: 'EN_MAINTENANCE',
  EN_TRANSIT: 'EN_TRANSIT',
  REFORME: 'REFORME',
} as const;
export type EquipmentStatus = (typeof EquipmentStatus)[keyof typeof EquipmentStatus];

export const CostKind = {
  MAIN_OEUVRE: 'MAIN_OEUVRE',
  PIECE: 'PIECE',
  FACTURE_EXTERNE: 'FACTURE_EXTERNE',
  DEPLACEMENT: 'DEPLACEMENT',
} as const;
export type CostKind = (typeof CostKind)[keyof typeof CostKind];

export const Role = {
  FIELD_MANAGER: 'FIELD_MANAGER',
  PARK_MANAGER: 'PARK_MANAGER',
  MECHANIC: 'MECHANIC',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
