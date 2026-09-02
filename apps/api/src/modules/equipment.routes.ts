import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';

export const equipmentRouter = Router();
equipmentRouter.use(requireAuth);

const EquipmentBody = z.object({
  assetTag: z.string().min(2),
  qrPayload: z.string().min(2).optional(),
  name: z.string().min(2),
  kind: z.string().min(2), // ORGANE | INSTALLATION | EQUIPEMENT | OUVRAGE …
  lotId: z.string().uuid().nullish(),
  zone: z.string().max(80).optional(),
  criticality: z.enum(['CRITIQUE', 'IMPORTANT', 'STANDARD']).default('STANDARD'),
  brand: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  year: z.number().int().optional(),
  meterKind: z.enum(['HEURES', 'KM', 'NONE']).default('NONE'),
  acquisitionDate: z.string().datetime().or(z.string().date()).optional(),
  acquisitionCost: z.number().nonnegative().optional(),
});

// résolution par QR (utilisé par la PWA au scan)
equipmentRouter.get('/by-qr/:payload', async (req, res) => {
  const eq = await prisma.equipment.findUnique({
    where: { qrPayload: req.params.payload },
    include: {
      assignments: { where: { toDate: null }, include: { site: { select: { id: true, code: true, name: true } } } },
      preventivePlans: { where: { active: true } },
    },
  });
  if (!eq) return res.status(404).json({ error: 'not_found' });
  res.json({ ...eq, currentSite: eq.assignments[0]?.site ?? null });
});

equipmentRouter.get('/', async (req, res, next) => {
  try {
    const { status, lotId, siteId } = z
      .object({ status: z.string().optional(), lotId: z.string().uuid().optional(), siteId: z.string().uuid().optional() })
      .parse(req.query);
    const data = await prisma.equipment.findMany({
      where: {
        status: status ? { in: status.split(',').filter(Boolean) } : undefined,
        lotId: lotId || undefined,
        assignments: siteId ? { some: { siteId, toDate: null } } : undefined,
      },
      include: {
        lot: { select: { code: true, name: true, color: true } },
        assignments: { where: { toDate: null }, include: { site: { select: { code: true, name: true } } }, take: 1 },
      },
      orderBy: { assetTag: 'asc' },
    });
    res.json({ data: data.map((e) => ({ ...e, site: e.assignments[0]?.site ?? null })) });
  } catch (e) {
    next(e);
  }
});

// ── CARNET DE SANTÉ d'un actif ──────────────────────────────────────
equipmentRouter.get('/:id', async (req, res, next) => {
  try {
    const eq = await prisma.equipment.findUnique({
      where: { id: req.params.id },
      include: {
        lot: true,
        assignments: { include: { site: { select: { code: true, name: true } } }, orderBy: { fromDate: 'desc' } },
        preventivePlans: { where: { active: true } },
        meterReadings: { orderBy: { readAt: 'desc' }, take: 20 },
      },
    });
    if (!eq) return res.status(404).json({ error: 'not_found' });

    const tickets = await prisma.ticket.findMany({
      where: { equipmentId: eq.id },
      orderBy: { createdAtField: 'desc' },
      include: {
        costLines: { select: { amount: true } },
        interventions: { select: { assigneeKind: true, laborHours: true, endedAt: true, mechanic: { select: { fullName: true } }, provider: { select: { name: true } } } },
      },
    });

    const lifetimeCost = await prisma.costLine.aggregate({ _sum: { amount: true }, where: { equipmentId: eq.id } });
    const openTickets = tickets.filter((t) => !['CLOTURE', 'ANNULE'].includes(t.status)).length;

    res.json({
      ...eq,
      currentSite: eq.assignments.find((a) => !a.toDate)?.site ?? null,
      lifetimeCost: Number(lifetimeCost._sum.amount ?? 0),
      openTickets,
      tickets: tickets.map((t) => ({
        id: t.id, reference: t.reference, type: t.type, urgency: t.urgency, status: t.status,
        title: t.title, createdAtField: t.createdAtField, closedAt: t.closedAt, dueDate: t.dueDate,
        cost: t.costLines.reduce((s, c) => s + Number(c.amount), 0),
        intervention: t.interventions[0] ?? null,
      })),
    });
  } catch (e) {
    next(e);
  }
});

equipmentRouter.post('/', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const body = EquipmentBody.parse(req.body);
    const eq = await prisma.equipment.create({
      data: {
        ...body,
        qrPayload: body.qrPayload ?? `GMAO:${body.assetTag}`,
        lotId: body.lotId ?? null,
        acquisitionDate: body.acquisitionDate ? new Date(body.acquisitionDate) : undefined,
      },
    });
    res.status(201).json(eq);
  } catch (e: any) {
    if (e?.code === 'P2002') return res.status(409).json({ error: 'assetTag_deja_utilise' });
    next(e);
  }
});

equipmentRouter.patch('/:id/status', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const { status } = z
      .object({ status: z.enum(['EN_SERVICE', 'EN_PANNE', 'EN_MAINTENANCE', 'EN_TRANSIT', 'REFORME']) })
      .parse(req.body);
    const eq = await prisma.equipment.update({ where: { id: req.params.id }, data: { status } });
    res.json(eq);
  } catch (e) {
    next(e);
  }
});

// transfert d'un engin vers un autre chantier → passe EN_TRANSIT puis affecté
equipmentRouter.post('/:id/transfer', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const { toSiteId, arriveAt } = z
      .object({ toSiteId: z.string().uuid(), arriveAt: z.string().datetime().optional() })
      .parse(req.body);
    await prisma.$transaction(async (tx) => {
      await tx.equipmentAssignment.updateMany({ where: { equipmentId: req.params.id, toDate: null }, data: { toDate: new Date() } });
      await tx.equipmentAssignment.create({ data: { equipmentId: req.params.id, siteId: toSiteId, fromDate: arriveAt ? new Date(arriveAt) : new Date() } });
      await tx.equipment.update({ where: { id: req.params.id }, data: { status: 'EN_TRANSIT' } });
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
