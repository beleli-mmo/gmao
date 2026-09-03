import { submitTicket, type SubmitResult } from './pouch';
import type { FieldTicketDoc } from '../shared';

/** Identifiant unique par demande (clé d'idempotence côté serveur). */
function newClientId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `di-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** Données saisies dans le formulaire terrain. */
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => {
      const s = String(fr.result);
      resolve(s.slice(s.indexOf(',') + 1)); // retire le préfixe "data:...;base64,"
    };
    fr.readAsDataURL(blob);
  });
}

/**
 * Envoi IMMÉDIAT d'une DI (nécessite une connexion).
 *  - succès → { ok:true, reference } et la DI est archivée localement
 *  - échec  → { ok:false, error } ; le formulaire reste rempli pour réessayer
 */
export async function submitFieldTicket(input: NewTicketInput): Promise<SubmitResult> {
  const clientId = newClientId();

  const media = await Promise.all(
    input.media.slice(0, 6).map(async (m) => ({
      kind: m.kind,
      mimeType: m.blob.type || 'application/octet-stream',
      dataBase64: await blobToBase64(m.blob),
      capturedAt: m.capturedAt,
    })),
  );

  return submitTicket({
    clientId,
    type: input.ticketType,
    urgency: input.urgency,
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    siteId: input.siteId,
    equipmentId: input.equipmentId ?? null,
    reporterId: input.reporterId,
    meterKind: input.meterKind,
    meterValue: input.meterValue ?? null,
    createdAtField: new Date().toISOString(),
    geo: input.geo ?? null,
    requestedParts: input.requestedParts ?? [],
    media,
    fieldSignature: null,
  });
}
