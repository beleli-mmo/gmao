import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';

export const providersRouter = Router();
providersRouter.use(requireAuth);

const DAY = 86_400_000;

/** KPI de respect du planning à partir d'une liste d'interventions. */
function planKpis(ivs: { scheduledFor: Date | null; expectedDeliveryAt: Date | null; endedAt: Date | null; laborHours: number | null }[]) {
  const done = ivs.filter((i) => i.endedAt);
  const withTarget = done.filter((i) => i.expectedDeliveryAt);
  const onTime = withTarget.filter((i) => i.endedAt! <= i.expectedDeliveryAt!);
  const delaysDays = withTarget.map((i) => Math.max(0, (i.endedAt!.getTime() - i.expectedDeliveryAt!.getTime()) / DAY));
  return {
    total: ivs.length,
    done: done.length,
    open: ivs.length - done.length,
    withTarget: withTarget.length,
    onTime: onTime.length,
    planRespectPct: withTarget.length ? Math.round((onTime.length / withTarget.length) * 1000) / 10 : null,
    avgDelayDays: delaysDays.length ? Math.round((delaysDays.reduce((s, d) => s + d, 0) / delaysDays.length) * 10) / 10 : null,
    totalHours: done.reduce((s, i) => s + (i.laborHours ?? 0), 0),
  };
}

/** GET /api/providers[?all=1] — liste des prestataires (externes). */
providersRouter.get('/', async (req, res, next) => {
  try {
    const { all } = z.object({ all: z.coerce.boolean().optional() }).parse(req.query);
    const rows = await prisma.provider.findMany({
      where: all ? {} : { active: true },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { interventions: true, externalInvoices: true } },
        interventions: { select: { scheduledFor: true, expectedDeliveryAt: true, endedAt: true, laborHours: true } },
      },
    });
    res.json({
      data: rows.map((p) => {
        const { interventions, ...rest } = p;
        return { ...rest, kpis: planKpis(interventions) };
      }),
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/providers/:id — fiche + historique des interventions + efficacité. */
providersRouter.get('/:id', async (req, res, next) => {
  try {
    const p = await prisma.provider.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { externalInvoices: true } },
        interventions: {
          orderBy: [{ scheduledFor: 'desc' }],
          include: {
            ticket: {
              select: {
                id: true, reference: true, title: true, status: true, urgency: true,
                site: { select: { name: true } },
                equipment: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!p) return res.status(404).json({ error: 'introuvable' });

    const history = p.interventions.map((iv) => {
      const late = iv.endedAt && iv.expectedDeliveryAt ? iv.endedAt > iv.expectedDeliveryAt : null;
      const delayDays = iv.endedAt && iv.expectedDeliveryAt
        ? Math.round(((iv.endedAt.getTime() - iv.expectedDeliveryAt.getTime()) / DAY) * 10) / 10
        : null;
      return {
        id: iv.id,
        ticketId: iv.ticket?.id ?? iv.ticketId,
        reference: iv.ticket?.reference ?? null,
        title: iv.ticket?.title ?? null,
        ticketStatus: iv.ticket?.status ?? null,
        urgency: iv.ticket?.urgency ?? null,
        siteName: iv.ticket?.site?.name ?? null,
        assetName: iv.ticket?.equipment?.name ?? null,
        scheduledFor: iv.scheduledFor,
        expectedDeliveryAt: iv.expectedDeliveryAt,
        startedAt: iv.startedAt,
        endedAt: iv.endedAt,
        laborHours: iv.laborHours,
        travelKm: iv.travelKm,
        report: iv.report,
        onTime: late === null ? null : !late,
        delayDays,
      };
    });

    const { interventions, ...rest } = p;
    res.json({ ...rest, kpis: planKpis(interventions), history });
  } catch (e) {
    next(e);
  }
});

const ProviderBody = z.object({
  name: z.string().min(2),
  contactName: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().email().nullish().or(z.literal('')),
  siret: z.string().nullish(),
  specialties: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

providersRouter.post('/', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const b = ProviderBody.parse(req.body);
    const p = await prisma.provider.create({
      data: { ...b, email: b.email || null, specialties: b.specialties ?? [] },
    });
    res.status(201).json(p);
  } catch (e) {
    next(e);
  }
});

providersRouter.patch('/:id', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const b = ProviderBody.partial().parse(req.body);
    const p = await prisma.provider.update({
      where: { id: req.params.id },
      data: { ...b, email: b.email === '' ? null : b.email },
    });
    res.json(p);
  } catch (e) {
    next(e);
  }
});

providersRouter.delete('/:id', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const id = req.params.id;
    const cnt = await prisma.provider.findUnique({
      where: { id },
      select: { _count: { select: { interventions: true, externalInvoices: true } } },
    });
    if (!cnt) return res.status(404).json({ error: 'introuvable' });
    if (cnt._count.interventions + cnt._count.externalInvoices > 0) {
      return res.status(409).json({
        error: 'prestataire_utilise',
        message: 'Ce prestataire a un historique (interventions, factures). Désactivez-le plutôt que de le supprimer.',
      });
    }
    await prisma.provider.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
