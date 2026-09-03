import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { applyTransition } from '../sync/ticket-state-machine';
import { QualifyTicketBody, PlanTicketBody, CloseTicketBody } from '../shared';
import { broadcast } from '../realtime';
import { nextTicketReference } from '../lib/reference';
import { recomputeTicketCosts } from '../lib/cost-imputation';
import { signedGetUrl } from '../lib/object-store';
import { randomUUID } from 'node:crypto';

export const ticketsRouter = Router();
ticketsRouter.use(requireAuth);

// ── CRÉATION depuis le bureau (saisie d'une demande reçue par téléphone / radio) ──
const CreateTicketBody = z.object({
  type: z.enum(['PANNE_CRITIQUE', 'MAINTENANCE_PREVENTIVE', 'DEMANDE_PIECE']),
  urgency: z.enum(['N1_BLOQUANT', 'N2_MAJEUR', 'N3_MINEUR']),
  title: z.string().min(3).max(140),
  description: z.string().max(4000).optional(),
  siteId: z.string().uuid(),
  equipmentId: z.string().uuid().nullish(),
  reporterId: z.string().uuid(),
  meterValue: z.number().nonnegative().nullish(),
  dueDate: z.string().datetime().or(z.string().date()).nullish(), // échéance (préventif) → TRPP
  requestedParts: z.array(z.object({ partId: z.string().uuid(), qty: z.number().positive() })).optional(),
});

ticketsRouter.post('/', requireRole('PARK_MANAGER', 'ADMIN', 'FIELD_MANAGER'), async (req, res, next) => {
  try {
    const body = CreateTicketBody.parse(req.body);
    const reporter = await prisma.user.findUnique({ where: { id: body.reporterId } });
    if (!reporter) return res.status(422).json({ error: 'reporter_invalide' });

    const needsEquipment = body.type !== 'DEMANDE_PIECE';
    if (needsEquipment && !body.equipmentId) return res.status(422).json({ error: 'equipment_requis' });

    const ticket = await prisma.$transaction(async (tx) => {
      // lot technique hérité de l'actif concerné (axe d'imputation)
      const eq = needsEquipment && body.equipmentId
        ? await tx.equipment.findUnique({ where: { id: body.equipmentId } })
        : null;

      // référence : réessai en cas de collision sur l'unique
      let created;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          created = await tx.ticket.create({
            data: {
              reference: await nextTicketReference(tx),
              clientId: `bureau-${randomUUID()}`,
              type: body.type,
              urgency: body.urgency,
              status: 'CREE',
              title: body.title.trim(),
              description: body.description?.trim(),
              siteId: body.siteId,
              equipmentId: needsEquipment ? body.equipmentId! : null,
              lotId: eq?.lotId ?? null,
              reporterId: body.reporterId,
              meterAtReport: body.meterValue ?? null,
              dueDate: body.dueDate ? new Date(body.dueDate) : null,
              createdAtField: new Date(),
            },
          });
          break;
        } catch (e: any) {
          if (e?.code === 'P2002' && attempt < 3) continue;
          throw e;
        }
      }
      const t = created!;

      if (needsEquipment && body.equipmentId && body.meterValue != null) {
        await tx.meterReading.create({
          data: {
            equipmentId: body.equipmentId,
            value: body.meterValue,
            kind: eq?.meterKind === 'KM' ? 'KM' : 'HEURES',
            source: 'ADMIN',
            recordedById: req.user!.id,
            ticketId: t.id,
          },
        });
        await tx.equipment.update({ where: { id: body.equipmentId }, data: { currentMeter: body.meterValue } });
      }

      for (const rp of body.requestedParts ?? []) {
        const part = await tx.part.findUnique({ where: { id: rp.partId } });
        if (part) {
          await tx.ticketPart.create({
            data: { ticketId: t.id, partId: rp.partId, qtyRequested: rp.qty, unitCost: part.unitCost },
          });
        }
      }

      // CRÉÉ → EN_ATTENTE (au nom du chef de chantier déclarant)
      await applyTransition(tx, {
        ticketId: t.id,
        to: 'EN_ATTENTE',
        actor: { id: body.reporterId, role: 'FIELD_MANAGER' },
        origin: 'API',
        note: `Saisie bureau par ${req.user!.fullName}`,
      });

      if (body.type === 'PANNE_CRITIQUE' && body.urgency === 'N1_BLOQUANT' && body.equipmentId) {
        await tx.equipment.update({ where: { id: body.equipmentId }, data: { status: 'EN_PANNE' } });
      }

      return t;
    });

    broadcast({ type: 'ticket.updated', ticketId: ticket.id, status: 'EN_ATTENTE' });
    res.status(201).json({ id: ticket.id, reference: ticket.reference });
  } catch (e) {
    next(e);
  }
});

// ── LISTE + filtres (bureau) ──────────────────────────────────────────
ticketsRouter.get('/', async (req, res, next) => {
  try {
    const q = z
      .object({
        status: z.string().optional(),
        siteId: z.string().uuid().optional(),
        equipmentId: z.string().uuid().optional(),
        urgency: z.string().optional(),
        cursor: z.string().uuid().optional(),
        take: z.coerce.number().min(1).max(100).default(50),
      })
      .parse(req.query);

    const csv = (v?: string) => (v ? v.split(',').filter(Boolean) : undefined);
    const statusIn = csv(q.status);
    const urgencyIn = csv(q.urgency);

    const tickets = await prisma.ticket.findMany({
      where: {
        status: statusIn ? { in: statusIn } : undefined,
        siteId: q.siteId,
        equipmentId: q.equipmentId,
        urgency: urgencyIn ? { in: urgencyIn } : undefined,
      },
      include: {
        site: { select: { code: true, name: true } },
        equipment: { select: { assetTag: true, name: true } },
        lot: { select: { code: true, name: true, color: true } },
        _count: { select: { attachments: true, costLines: true } },
      },
      // la plus récente en premier (l'urgence est déjà une colonne filtrable/badge)
      orderBy: [{ createdAtField: 'desc' }, { createdAt: 'desc' }],
      take: q.take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });

    const nextCursor = tickets.length > q.take ? tickets.pop()!.id : null;
    res.json({ data: tickets, nextCursor });
  } catch (e) {
    next(e);
  }
});

// ── DÉTAIL ───────────────────────────────────────────────────────────
ticketsRouter.get('/:id', async (req, res, next) => {
 try {
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    include: {
      site: true,
      equipment: { include: { lot: true } },
      lot: true,
      reporter: { select: { id: true, fullName: true } },
      attachments: true,
      signature: true,
      events: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { fullName: true } } } },
      interventions: { include: { mechanic: { select: { fullName: true } }, provider: true } },
      requestedParts: { include: { part: true } },
      costLines: true,
      externalInvoices: true,
    },
  });
  if (!ticket) return res.status(404).json({ error: 'not_found' });
  const totalCost = ticket.costLines.reduce((s, l) => s + Number(l.amount), 0);

  // liens de téléchargement signés (valides 1 h) pour les pièces jointes
  const attachments = await Promise.all(
    ticket.attachments.map(async (a) => ({ ...a, url: await signedGetUrl(a.storageKey) })),
  );

  res.json({ ...ticket, attachments, totalCost });
 } catch (e) {
  next(e);
 }
});

// ── QUALIFICATION : EN_ATTENTE → QUALIFIE ────────────────────────────
ticketsRouter.post('/:id/qualify', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const body = QualifyTicketBody.parse(req.body);
    await prisma.$transaction(async (tx) => {
      if (body.urgency || body.diagnostic) {
        await tx.ticket.update({
          where: { id: req.params.id },
          data: {
            urgency: body.urgency as any,
            description: body.diagnostic
              ? `${body.diagnostic}\n---\n(diag. ${req.user!.fullName})`
              : undefined,
            qualifierId: req.user!.id,
          },
        });
      }
      await applyTransition(tx, {
        ticketId: req.params.id,
        to: 'QUALIFIE',
        actor: req.user!,
        note: body.diagnostic,
      });
    });
    broadcast({ type: 'ticket.updated', ticketId: req.params.id, status: 'QUALIFIE' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ── PLANIFICATION + ATTRIBUTION : QUALIFIE → PLANIFIE ────────────────
ticketsRouter.post('/:id/plan', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const body = PlanTicketBody.parse(req.body);
    await prisma.$transaction(async (tx) => {
      await tx.intervention.create({
        data: {
          ticketId: req.params.id,
          assigneeKind: body.assigneeKind,
          mechanicId: body.assigneeKind === 'MECHANIC' ? body.mechanicId : null,
          providerId: body.assigneeKind === 'PROVIDER' ? body.providerId : null,
          scheduledFor: new Date(body.scheduledFor),
          laborRate: body.assigneeKind === 'MECHANIC' ? Number(process.env.DEFAULT_LABOR_RATE ?? 12000) : null,
        },
      });
      await applyTransition(tx, { ticketId: req.params.id, to: 'PLANIFIE', actor: req.user! });
    });
    broadcast({ type: 'ticket.updated', ticketId: req.params.id, status: 'PLANIFIE' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ── DÉMARRAGE / FIN DE TRAVAUX (mécanicien) ──────────────────────────
const WorkDoneBody = z.object({
  interventionId: z.string().uuid(),
  laborHours: z.number().positive(),
  travelKm: z.number().nonnegative().optional(),
  report: z.string().max(4000).optional(),
  partsUsed: z
    .array(z.object({ partId: z.string().uuid(), qty: z.number().positive() }))
    .default([]),
  newMeterValue: z.number().nonnegative().optional(),
});

ticketsRouter.post('/:id/start', requireRole('MECHANIC', 'PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    await prisma.$transaction((tx) =>
      applyTransition(tx, { ticketId: req.params.id, to: 'EN_COURS', actor: req.user! }),
    );
    broadcast({ type: 'ticket.updated', ticketId: req.params.id, status: 'EN_COURS' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

ticketsRouter.post('/:id/work-done', requireRole('MECHANIC', 'PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const body = WorkDoneBody.parse(req.body);
    await prisma.$transaction(async (tx) => {
      await tx.intervention.update({
        where: { id: body.interventionId },
        data: {
          laborHours: body.laborHours,
          travelKm: body.travelKm,
          report: body.report,
          startedAt: (await tx.intervention.findUniqueOrThrow({ where: { id: body.interventionId } })).startedAt ?? new Date(),
          endedAt: new Date(),
        },
      });

      // consommation de pièces + décrément stock + mouvement
      for (const p of body.partsUsed) {
        const part = await tx.part.findUniqueOrThrow({ where: { id: p.partId } });
        await tx.ticketPart.create({
          data: {
            ticketId: req.params.id,
            interventionId: body.interventionId,
            partId: p.partId,
            qtyRequested: p.qty,
            qtyConsumed: p.qty,
            unitCost: part.unitCost,
          },
        });
        await tx.stockItem.update({
          where: { partId: p.partId },
          data: { onHand: { decrement: p.qty } },
        });
        await tx.stockMovement.create({
          data: { partId: p.partId, kind: 'SORTIE', quantity: p.qty, unitCost: part.unitCost, ticketId: req.params.id },
        });
      }

      // relevé compteur de sortie d'atelier
      if (body.newMeterValue != null) {
        const t = await tx.ticket.findUniqueOrThrow({ where: { id: req.params.id } });
        if (t.equipmentId) {
          await tx.meterReading.create({
            data: { equipmentId: t.equipmentId, value: body.newMeterValue, kind: 'HEURES', source: 'ADMIN', recordedById: req.user!.id },
          });
          await tx.equipment.update({ where: { id: t.equipmentId }, data: { currentMeter: body.newMeterValue } });
        }
      }

      await applyTransition(tx, { ticketId: req.params.id, to: 'TRAVAUX_TERMINES', actor: req.user!, note: body.report });
    });
    broadcast({ type: 'ticket.updated', ticketId: req.params.id, status: 'TRAVAUX_TERMINES' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ── VALIDATION TERRAIN (aussi possible via synchro offline, cf. worker) ──
const ValidateBody = z.object({ signatureKey: z.string(), signerName: z.string().min(2), geoLat: z.number().optional(), geoLng: z.number().optional() });
ticketsRouter.post('/:id/validate', requireRole('FIELD_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const body = ValidateBody.parse(req.body);
    await prisma.$transaction(async (tx) => {
      await tx.ticketSignature.upsert({
        where: { ticketId: req.params.id },
        create: { ticketId: req.params.id, signerId: req.user!.id, signerName: body.signerName, signatureKey: body.signatureKey, geoLat: body.geoLat, geoLng: body.geoLng },
        update: { signatureKey: body.signatureKey, signedAt: new Date() },
      });
      await applyTransition(tx, { ticketId: req.params.id, to: 'VALIDE_TERRAIN', actor: req.user! });
    });
    broadcast({ type: 'ticket.updated', ticketId: req.params.id, status: 'VALIDE_TERRAIN' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ── CLÔTURE : fige les coûts, impute au chantier ─────────────────────
ticketsRouter.post('/:id/close', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const body = CloseTicketBody.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const t = await tx.ticket.findUniqueOrThrow({ where: { id: req.params.id } });
      for (const l of body.extraCostLines) {
        await tx.costLine.create({
          data: {
            ticketId: t.id,
            siteId: t.siteId,
            equipmentId: t.equipmentId ?? undefined,
            lotId: t.lotId ?? undefined,
            kind: l.kind as any,
            label: l.label,
            quantity: l.quantity,
            unitAmount: l.unitAmount,
            amount: Number((l.quantity * l.unitAmount).toFixed(2)),
          },
        });
      }
      await applyTransition(tx, { ticketId: t.id, to: 'CLOTURE', actor: req.user! });
      const lines = await tx.costLine.findMany({ where: { ticketId: t.id } });
      return { total: lines.reduce((s, x) => s + Number(x.amount), 0), siteCode: (await tx.site.findUnique({ where: { id: t.siteId } }))?.code };
    });
    broadcast({ type: 'ticket.updated', ticketId: req.params.id, status: 'CLOTURE' });
    res.json({ ok: true, imputation: result });
  } catch (e) {
    next(e);
  }
});

// ── FACTURE EXTERNE : rattache une facture prestataire, recalcule les coûts imputés ──
const ExternalInvoiceBody = z.object({
  providerId: z.string().uuid().nullish(),
  invoiceRef: z.string().min(1),
  amountHT: z.number().nonnegative(),
  vatAmount: z.number().nonnegative().default(0),
  invoiceDate: z.string().datetime().or(z.string().date()),
});
ticketsRouter.post('/:id/external-invoice', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const body = ExternalInvoiceBody.parse(req.body);
    await prisma.$transaction(async (tx) => {
      await tx.externalInvoice.create({
        data: {
          ticketId: req.params.id,
          providerId: body.providerId ?? null,
          invoiceRef: body.invoiceRef,
          amountHT: body.amountHT,
          vatAmount: body.vatAmount,
          invoiceDate: new Date(body.invoiceDate),
        },
      });
      const t = await tx.ticket.findUniqueOrThrow({ where: { id: req.params.id } });
      if (t.status !== 'CLOTURE') await recomputeTicketCosts(tx as any, t.id, { lock: false });
    });
    broadcast({ type: 'ticket.updated', ticketId: req.params.id, status: 'FACTURE_AJOUTEE' });
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});
