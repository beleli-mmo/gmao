import { z } from 'zod';

/** Schéma d'un ticket créé sur le terrain (document PouchDB `ticket:*`). */
export const FieldTicketDoc = z.object({
  _id: z.string().regex(/^ticket:[0-9a-f-]{36}$/), // ticket:<uuid v4>
  type: z.literal('ticket'),
  schemaVersion: z.literal(1),

  clientId: z.string().uuid(),              // idempotence côté serveur
  ticketType: z.enum(['PANNE_CRITIQUE', 'MAINTENANCE_PREVENTIVE', 'DEMANDE_PIECE']),
  urgency: z.enum(['N1_BLOQUANT', 'N2_MAJEUR', 'N3_MINEUR']),

  title: z.string().min(3).max(140),
  description: z.string().max(4000).optional(),

  siteId: z.string().uuid(),
  equipmentId: z.string().uuid().nullable().optional(),
  qrPayload: z.string().optional(),        // si identification par scan

  meterKind: z.enum(['HEURES', 'KM', 'NONE']).default('NONE'),
  meterValue: z.number().nonnegative().nullable().optional(),

  requestedParts: z
    .array(z.object({ partId: z.string().uuid(), sku: z.string().optional(), qty: z.number().positive() }))
    .default([]),

  reporterId: z.string().uuid(),
  createdAtField: z.string().datetime(),   // ISO, horloge de l'appareil
  geo: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),

  // pièces jointes = attachments CouchDB (clé = nom de fichier), on garde juste les métadonnées ici
  media: z
    .array(
      z.object({
        attName: z.string(),                // nom de l'attachment CouchDB
        kind: z.enum(['PHOTO', 'VIDEO', 'VOICE_NOTE', 'DOCUMENT']),
        mimeType: z.string(),
        sizeBytes: z.number().int().nonnegative(),
        capturedAt: z.string().datetime().optional(),
      }),
    )
    .default([]),

  // rempli plus tard sur le terrain lors de la validation
  fieldSignature: z
    .object({
      attName: z.string(),                  // PNG du tracé
      signerName: z.string().min(2),
      signedAt: z.string().datetime(),
    })
    .nullable()
    .optional(),

  // statut local — le serveur reste maître via la machine à états
  localStatus: z.enum(['EN_ATTENTE', 'VALIDE_TERRAIN']).default('EN_ATTENTE'),
});
export type FieldTicketDoc = z.infer<typeof FieldTicketDoc>;

/** Payload REST de qualification (bureau). */
export const QualifyTicketBody = z.object({
  urgency: z.enum(['N1_BLOQUANT', 'N2_MAJEUR', 'N3_MINEUR']).optional(),
  diagnostic: z.string().max(4000).optional(),
});

/** Payload REST de planification / attribution. */
export const PlanTicketBody = z
  .object({
    assigneeKind: z.enum(['MECHANIC', 'PROVIDER']),
    mechanicId: z.string().uuid().optional(),
    providerId: z.string().uuid().optional(),
    scheduledFor: z.string().datetime(),
  })
  .refine((v) => (v.assigneeKind === 'MECHANIC' ? !!v.mechanicId : !!v.providerId), {
    message: 'mechanicId ou providerId requis selon assigneeKind',
  });

/** Clôture : lignes de coût complémentaires + validation. */
export const CloseTicketBody = z.object({
  extraCostLines: z
    .array(
      z.object({
        kind: z.enum(['MAIN_OEUVRE', 'PIECE', 'FACTURE_EXTERNE', 'DEPLACEMENT']),
        label: z.string(),
        quantity: z.number().positive().default(1),
        unitAmount: z.number().nonnegative(),
      }),
    )
    .default([]),
});
