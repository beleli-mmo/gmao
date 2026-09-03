import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { applyTransition } from '../sync/ticket-state-machine';
import { nextTicketReference } from '../lib/reference';
import { putObject } from '../lib/object-store';
import { broadcast } from '../realtime';

export const syncRouter = Router();
syncRouter.use(requireAuth);

/**
 * Historique des demandes du technicien connecté (écran « Mes demandes »).
 * GET /api/sync/my-tickets
 */
syncRouter.get('/my-tickets', async (req, res, next) => {
  try {
    const rows = await prisma.ticket.findMany({
      where: { reporterId: req.user!.id },
      orderBy: { createdAtField: 'desc' },
      take: 60,
      select: {
        reference: true, title: true, type: true, urgency: true, status: true,
        createdAtField: true, closedAt: true,
        site: { select: { code: true } },
        equipment: { select: { assetTag: true } },
        lot: { select: { code: true } },
      },
    });
    res.json({
      data: rows.map((t) => ({
        reference: t.reference,
        title: t.title,
        type: t.type,
        urgency: t.urgency,
        status: t.status,
        createdAtField: t.createdAtField,
        closedAt: t.closedAt,
        siteCode: t.site?.code ?? null,
        assetTag: t.equipment?.assetTag ?? null,
        lotCode: t.lot?.code ?? null,
      })),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * Référentiel descendant pour la PWA terrain (fonctionne hors ligne une fois mis en cache).
 * GET /api/sync/reference
 */
syncRouter.get('/reference', async (_req, res, next) => {
  try {
    const [sites, lots, equipment, parts] = await Promise.all([
      prisma.site.findMany({ where: { active: true }, select: { id: true, code: true, name: true } }),
      prisma.technicalLot.findMany({ where: { active: true }, select: { id: true, code: true, name: true, color: true } }),
      prisma.equipment.findMany({
        where: { status: { not: 'REFORME' } },
        select: {
          id: true, assetTag: true, qrPayload: true, name: true, zone: true, criticality: true,
          meterKind: true, currentMeter: true, lotId: true,
          assignments: { where: { toDate: null }, select: { siteId: true }, take: 1 },
        },
      }),
      prisma.part.findMany({ where: { active: true }, select: { id: true, sku: true, label: true, unit: true } }),
    ]);
    res.json({
      serverTime: new Date().toISOString(),
      sites,
      lots,
      parts,
      equipment: equipment.map((e) => ({ ...e, siteId: e.assignments[0]?.siteId ?? null, assignments: undefined })),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * Remontée d'une (ou plusieurs) DI créées hors ligne sur le terrain.
 * Idempotent : la clé `clientId` empêche les doublons si la PWA rejoue l'envoi.
 * POST /api/sync/tickets   { tickets: FieldTicket[] }
 */
const Media = z.object({
  kind: z.enum(['PHOTO', 'VIDEO', 'VOICE_NOTE', 'DOCUMENT']),
  mimeType: z.string(),
  dataBase64: z.string(),           // contenu binaire encodé base64 (sans préfixe data:)
  capturedAt: z.string().datetime().optional(),
});
const FieldTicket = z.object({
  clientId: z.string().min(8),
  type: z.enum(['PANNE_CRITIQUE', 'MAINTENANCE_PREVENTIVE', 'DEMANDE_PIECE']),
  urgency: z.enum(['N1_BLOQUANT', 'N2_MAJEUR', 'N3_MINEUR']),
  title: z.string().min(3).max(160),
  description: z.string().max(4000).optional(),
  siteId: z.string().uuid(),
  equipmentId: z.string().uuid().nullish(),
  reporterId: z.string().uuid(),
  meterKind: z.enum(['HEURES', 'KM', 'NONE']).default('NONE'),
  meterValue: z.number().nonnegative().nullish(),
  createdAtField: z.string().datetime(),
  geo: z.object({ lat: z.number(), lng: z.number() }).nullish(),
  requestedParts: z.array(z.object({ partId: z.string().uuid(), qty: z.number().positive() })).default([]),
  media: z.array(Media).max(8).default([]),
  fieldSignature: z.object({ signerName: z.string().min(2), signedAt: z.string().datetime(), dataBase64: z.string() }).nullish(),
});

syncRouter.post('/tickets', requireRole('FIELD_MANAGER', 'PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const { tickets } = z.object({ tickets: z.array(FieldTicket).min(1).max(50) }).parse(req.body);
    const results: { clientId: string; id: string; reference: string; status: 'created' | 'exists' }[] = [];

    for (const doc of tickets) {
      const existing = await prisma.ticket.findUnique({ where: { clientId: doc.clientId }, select: { id: true, reference: true } });
      if (existing) {
        results.push({ clientId: doc.clientId, id: existing.id, reference: existing.reference, status: 'exists' });
        continue;
      }

      const reporter = await prisma.user.findUnique({ where: { id: doc.reporterId } });
      if (!reporter) { results.push({ clientId: doc.clientId, id: '', reference: '', status: 'exists' }); continue; }
      const needsEquipment = doc.type !== 'DEMANDE_PIECE';

      // médias hors transaction (upload objet)
      const uploaded: { kind: any; storageKey: string; mimeType: string; sizeBytes: number; capturedAt?: Date | null }[] = [];
      for (const [i, m] of doc.media.entries()) {
        const buf = Buffer.from(m.dataBase64, 'base64');
        const ext = m.mimeType.split('/')[1]?.split(';')[0] ?? 'bin';
        const key = `tickets/${doc.clientId}/${m.kind.toLowerCase()}-${i}.${ext}`;
        await putObject(key, buf, m.mimeType);
        uploaded.push({ kind: m.kind, storageKey: key, mimeType: m.mimeType, sizeBytes: buf.length, capturedAt: m.capturedAt ? new Date(m.capturedAt) : null });
      }
      let sigKey: string | null = null;
      if (doc.fieldSignature) {
        const buf = Buffer.from(doc.fieldSignature.dataBase64, 'base64');
        sigKey = `signatures/${doc.clientId}.png`;
        await putObject(sigKey, buf, 'image/png');
      }

      const created = await prisma.$transaction(async (tx) => {
        const eq = needsEquipment && doc.equipmentId ? await tx.equipment.findUnique({ where: { id: doc.equipmentId } }) : null;

        let t;
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            t = await tx.ticket.create({
              data: {
                reference: await nextTicketReference(tx),
                clientId: doc.clientId,
                type: doc.type, urgency: doc.urgency, status: 'CREE',
                title: doc.title.trim(), description: doc.description?.trim(),
                siteId: doc.siteId,
                equipmentId: needsEquipment ? doc.equipmentId ?? null : null,
                lotId: eq?.lotId ?? null,
                reporterId: doc.reporterId,
                meterAtReport: doc.meterValue ?? null,
                createdAtField: new Date(doc.createdAtField),
              },
            });
            break;
          } catch (e: any) {
            if (e?.code === 'P2002' && attempt < 3) continue;
            throw e;
          }
        }
        const ticket = t!;

        if (eq && doc.meterValue != null && doc.meterKind !== 'NONE') {
          await tx.meterReading.create({ data: { equipmentId: eq.id, value: doc.meterValue, kind: doc.meterKind, source: 'FIELD', recordedById: doc.reporterId, ticketId: ticket.id } });
          await tx.equipment.update({ where: { id: eq.id }, data: { currentMeter: doc.meterValue } });
        }
        for (const rp of doc.requestedParts) {
          const part = await tx.part.findUnique({ where: { id: rp.partId } });
          if (part) await tx.ticketPart.create({ data: { ticketId: ticket.id, partId: rp.partId, qtyRequested: rp.qty, unitCost: part.unitCost } });
        }
        for (const u of uploaded) {
          await tx.ticketAttachment.create({ data: { ticketId: ticket.id, kind: u.kind, storageKey: u.storageKey, mimeType: u.mimeType, sizeBytes: u.sizeBytes, capturedAt: u.capturedAt } });
        }

        await applyTransition(tx, {
          ticketId: ticket.id, to: 'EN_ATTENTE',
          actor: { id: doc.reporterId, role: 'FIELD_MANAGER' }, origin: 'SYNC', note: 'Création terrain (synchro)',
        });

        if (doc.fieldSignature && sigKey) {
          // validation terrain hors ligne : ne s'applique que si l'atelier a déjà rendu le service
          const cur = await tx.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
          if (cur.status === 'TRAVAUX_TERMINES') {
            await tx.ticketSignature.create({ data: { ticketId: ticket.id, signerId: doc.reporterId, signerName: doc.fieldSignature.signerName, signatureKey: sigKey, signedAt: new Date(doc.fieldSignature.signedAt) } });
            await applyTransition(tx, { ticketId: ticket.id, to: 'VALIDE_TERRAIN', actor: { id: doc.reporterId, role: 'FIELD_MANAGER' }, origin: 'SYNC' });
          }
        }

        if (doc.type === 'PANNE_CRITIQUE' && doc.urgency === 'N1_BLOQUANT' && eq) {
          await tx.equipment.update({ where: { id: eq.id }, data: { status: 'EN_PANNE' } });
        }
        return ticket;
      });

      results.push({ clientId: doc.clientId, id: created.id, reference: created.reference, status: 'created' });
      broadcast({ type: 'ticket.synced', clientId: doc.clientId });
    }

    res.json({ results });
  } catch (e) {
    next(e);
  }
});
