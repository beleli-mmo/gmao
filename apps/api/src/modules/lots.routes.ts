import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';

export const lotsRouter = Router();
lotsRouter.use(requireAuth);

/** Lots techniques — référentiel d'imputation (Ascenseurs, SSI, Plomberie…). */
lotsRouter.get('/', async (req, res, next) => {
  try {
    const { all } = z.object({ all: z.coerce.boolean().optional() }).parse(req.query);
    const data = await prisma.technicalLot.findMany({
      where: all ? {} : { active: true },
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

const LotPatch = z.object({
  code: z.string().min(1).max(8).transform((s) => s.toUpperCase()).optional(),
  name: z.string().min(2).optional(),
  defaultFrequency: z.string().nullish(),
  isRegulatory: z.boolean().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  active: z.boolean().optional(),
});

lotsRouter.patch('/:id', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const lot = await prisma.technicalLot.update({ where: { id: req.params.id }, data: LotPatch.parse(req.body) });
    res.json(lot);
  } catch (e: any) {
    if (e?.code === 'P2002') return res.status(409).json({ error: 'code_deja_utilise' });
    next(e);
  }
});

// suppression d'un lot — refusée s'il est rattaché à des actifs, des DI ou des coûts
lotsRouter.delete('/:id', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const id = req.params.id;
    const cnt = await prisma.technicalLot.findUnique({
      where: { id },
      select: { _count: { select: { equipment: true, tickets: true, costLines: true } } },
    });
    if (!cnt) return res.status(404).json({ error: 'introuvable' });
    const { equipment, tickets, costLines } = cnt._count;
    if (equipment + tickets + costLines > 0) {
      return res.status(409).json({
        error: 'lot_utilise',
        message: 'Ce lot est rattaché à des actifs, des DI ou des coûts. Désactivez-le plutôt que de le supprimer.',
      });
    }
    await prisma.technicalLot.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
