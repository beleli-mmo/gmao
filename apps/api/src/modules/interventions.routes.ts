import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { broadcast } from '../realtime';

export const interventionsRouter = Router();
interventionsRouter.use(requireAuth);

/**
 * Liste des interventions — sert le planning admin.
 * GET /api/interventions?scheduled=1&horizonDays=14&mechanicId=...
 */
interventionsRouter.get('/', async (req, res, next) => {
  try {
    const q = z
      .object({
        scheduled: z.coerce.boolean().optional(),
        horizonDays: z.coerce.number().min(1).max(120).default(14),
        mechanicId: z.string().uuid().optional(),
      })
      .parse(req.query);

    const now = new Date();
    const until = new Date(now.getTime() + q.horizonDays * 864e5);

    const data = await prisma.intervention.findMany({
      where: {
        mechanicId: q.mechanicId,
        ...(q.scheduled
          ? { scheduledFor: { gte: new Date(now.getTime() - 3 * 864e5), lte: until }, endedAt: null }
          : {}),
      },
      include: {
        ticket: {
          select: {
            id: true, reference: true, title: true, status: true, urgency: true,
            site: { select: { code: true } },
            equipment: { select: { assetTag: true } },
          },
        },
        mechanic: { select: { id: true, fullName: true } },
        provider: { select: { id: true, name: true } },
      },
      orderBy: { scheduledFor: 'asc' },
      take: 300,
    });

    res.json({ data });
  } catch (e) {
    next(e);
  }
});

/**
 * Replanifier / réaffecter une intervention (glisser-déposer du planning, changement de mécano…).
 * PATCH /api/interventions/:id
 */
const RescheduleBody = z
  .object({
    scheduledFor: z.string().datetime().or(z.string().date()).optional(),
    assigneeKind: z.enum(['MECHANIC', 'PROVIDER']).optional(),
    mechanicId: z.string().uuid().nullish(),
    providerId: z.string().uuid().nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'aucune modification' });

interventionsRouter.patch('/:id', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const b = RescheduleBody.parse(req.body);
    const current = await prisma.intervention.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'introuvable' });
    if (current.endedAt) return res.status(409).json({ error: 'intervention_terminee' });

    const kind = b.assigneeKind ?? current.assigneeKind;
    const data: Record<string, unknown> = {};
    if (b.scheduledFor) data.scheduledFor = new Date(b.scheduledFor);
    if (b.assigneeKind || b.mechanicId !== undefined || b.providerId !== undefined) {
      data.assigneeKind = kind;
      data.mechanicId = kind === 'MECHANIC' ? (b.mechanicId ?? current.mechanicId) : null;
      data.providerId = kind === 'PROVIDER' ? (b.providerId ?? current.providerId) : null;
    }
    if (kind === 'MECHANIC' && !data.mechanicId && !current.mechanicId) {
      return res.status(422).json({ error: 'mechanicId_requis' });
    }
    if (kind === 'PROVIDER' && !data.providerId && !current.providerId) {
      return res.status(422).json({ error: 'providerId_requis' });
    }

    const updated = await prisma.intervention.update({
      where: { id: req.params.id },
      data,
      include: { mechanic: { select: { fullName: true } }, provider: { select: { name: true } } },
    });
    broadcast({ type: 'ticket.updated', ticketId: current.ticketId, status: 'REPLANIFIE' });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});
