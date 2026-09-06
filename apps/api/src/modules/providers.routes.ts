import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { planKpis, toHistoryRow, interventionHistoryInclude } from '../lib/intervention-kpis';

export const providersRouter = Router();
providersRouter.use(requireAuth);

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
        interventions: interventionHistoryInclude,
      },
    });
    if (!p) return res.status(404).json({ error: 'introuvable' });
    const { interventions, ...rest } = p;
    res.json({ ...rest, kpis: planKpis(interventions), history: interventions.map(toHistoryRow) });
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
