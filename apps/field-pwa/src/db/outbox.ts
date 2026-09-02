import { v4 as uuid } from 'uuid';
import { localTickets } from './pouch';
import type { FieldTicketDoc } from '@gmao/shared';

/**
 * Écriture d'un ticket terrain dans PouchDB.
 * - `_id` = `ticket:<uuid>` ; `clientId` identique = clé d'idempotence côté serveur
 * - les médias sont attachés en pièces jointes CouchDB (binaire, répliqué tel quel)
 * - `_sync.pushed` bascule à true quand la réplication confirme (écouté dans pouch.ts)
 */
export interface NewTicketInput {
  ticketType: FieldTicketDoc['ticketType'];
  urgency: FieldTicketDoc['urgency'];
  title: string;
  description?: string;
  siteId: string;
  equipmentId?: string | null;
  qrPayload?: string;
  meterKind: FieldTicketDoc['meterKind'];
  meterValue?: number | null;
  requestedParts?: { partId: string; qty: number }[];
  reporterId: string;
  geo?: { lat: number; lng: number } | null;
  media: { blob: Blob; kind: 'PHOTO' | 'VIDEO' | 'VOICE_NOTE' | 'DOCUMENT'; capturedAt?: string }[];
}

export async function createFieldTicket(input: NewTicketInput): Promise<{ _id: string; clientId: string }> {
  const clientId = uuid();
  const _id = `ticket:${clientId}`;

  const _attachments: Record<string, { content_type: string; data: Blob }> = {};
  const media: FieldTicketDoc['media'] = [];
  input.media.forEach((m, i) => {
    const ext = m.blob.type.split('/')[1]?.split(';')[0] ?? 'bin';
    const attName = `${m.kind.toLowerCase()}-${i}.${ext}`;
    _attachments[attName] = { content_type: m.blob.type, data: m.blob };
    media.push({ attName, kind: m.kind, mimeType: m.blob.type, sizeBytes: m.blob.size, capturedAt: m.capturedAt });
  });

  const doc = {
    _id,
    _attachments,
    type: 'ticket' as const,
    schemaVersion: 1 as const,
    clientId,
    ticketType: input.ticketType,
    urgency: input.urgency,
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    siteId: input.siteId,
    equipmentId: input.equipmentId ?? null,
    qrPayload: input.qrPayload,
    meterKind: input.meterKind,
    meterValue: input.meterValue ?? null,
    requestedParts: input.requestedParts ?? [],
    reporterId: input.reporterId,
    createdAtField: new Date().toISOString(),
    geo: input.geo ?? null,
    media,
    fieldSignature: null,
    localStatus: 'EN_ATTENTE' as const,
    _sync: { pushed: false, queuedAt: Date.now() },
  };

  await localTickets.put(doc as any);
  return { _id, clientId };
}

/** Ajoute la signature de validation terrain à un ticket déjà créé (peut se faire hors ligne). */
export async function attachFieldSignature(_id: string, signaturePng: Blob, signerName: string) {
  const doc: any = await localTickets.get(_id, { attachments: false });
  doc._attachments = doc._attachments ?? {};
  doc._attachments['signature.png'] = { content_type: 'image/png', data: signaturePng };
  doc.fieldSignature = { attName: 'signature.png', signerName, signedAt: new Date().toISOString() };
  doc.localStatus = 'VALIDE_TERRAIN';
  doc._sync = { pushed: false, queuedAt: Date.now() };
  await localTickets.put(doc);
}

/** Liste locale des tickets de ce terminal, brouillons + synchronisés. */
export async function listLocalTickets() {
  const res = await localTickets.allDocs({ include_docs: true, startkey: 'ticket:', endkey: 'ticket:￿' });
  return res.rows
    .map((r) => r.doc as any)
    .filter(Boolean)
    .sort((a, b) => (b.createdAtField > a.createdAtField ? 1 : -1));
}
