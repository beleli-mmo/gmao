import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';

export const lotsRouter = Router();
lotsRouter.use(requireAuth);

/** Lots techniques — référentiel d'imputation (Ascenseurs, SSI, Plomberie…). */
lotsRouter.get('/', async (_req, res, next) => {
  try {
    const data = await prisma.technicalLot.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
      include: { _count: { select: { equipment: true, tickets: true } } },
    });
    res.json({ data });
  } catch (e) {
    next(e);
  }
});

const LotBody = z.object({
  code: z.string().min(1).max(8).transform((s) => s.toUpperCase()),
  name: z.string().min(2),
  defaultFrequency: z.string().optional(),
  isRegulatory: z.boolean().default(false),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#64748b'),
});

lotsRouter.post('/', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const lot = await prisma.technicalLot.create({ data: LotBody.parse(req.body) });
    res.status(201).json(lot);
  } catch (e: any) {
    if (e?.code === 'P2002') return res.status(409).json({ error: 'code_deja_utilise' });
    next(e);
  }
});
