// Types partagés (copie locale — l'app est déployée indépendamment).
// Miroir de packages/shared/src/dto.ts (FieldTicketDoc), sans dépendance à zod.

export interface FieldTicketMedia {
  attName: string;
  kind: 'PHOTO' | 'VIDEO' | 'VOICE_NOTE' | 'DOCUMENT';
  mimeType: string;
  sizeBytes: number;
  capturedAt?: string;
}

export interface FieldTicketDoc {
  _id: string;
  type: 'ticket';
  schemaVersion: 1;
  clientId: string;
  ticketType: 'PANNE_CRITIQUE' | 'MAINTENANCE_PREVENTIVE' | 'DEMANDE_PIECE';
  urgency: 'N1_BLOQUANT' | 'N2_MAJEUR' | 'N3_MINEUR';
  title: string;
  description?: string;
  siteId: string;
  equipmentId?: string | null;
  qrPayload?: string;
  meterKind: 'HEURES' | 'KM' | 'NONE';
  meterValue?: number | null;
  requestedParts: { partId: string; sku?: string; qty: number }[];
  reporterId: string;
  createdAtField: string;
  geo?: { lat: number; lng: number } | null;
  media: FieldTicketMedia[];
  fieldSignature?: { attName: string; signerName: string; signedAt: string } | null;
  localStatus: 'EN_ATTENTE' | 'VALIDE_TERRAIN';
}
