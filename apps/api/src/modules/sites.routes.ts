import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';

export const sitesRouter = Router();
sitesRouter.use(requireAuth);

sitesRouter.get('/', async (req, res, next) => {
  try {
    const { active } = z.object({ active: z.coerce.boolean().optional() }).parse(req.query);
    const data = await prisma.site.findMany({
      where: active === undefined ? {} : { active },
      orderBy: { code: 'asc' },
      include: { _count: { select: { tickets: true, assignments: true } } },
    });
    res.json({ data });
  } catch (e) {
    next(e);
  }
});

const SiteBody = z.object({
  code: z.string().min(2).max(32),
  name: z.string().min(2),
  address: z.string().optional(),
  startDate: z.string().datetime().or(z.string().date()).optional(),
});

sitesRouter.post('/', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const body = SiteBody.parse(req.body);
    const site = await prisma.site.create({
      data: { ...body, startDate: body.startDate ? new Date(body.startDate) : undefined },
    });
    res.status(201).json(site);
  } catch (e: any) {
    if (e?.code === 'P2002') return res.status(409).json({ error: 'code_deja_utilise' });
    next(e);
  }
});

sitesRouter.patch('/:id', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const body = z
      .object({ name: z.string().optional(), address: z.string().optional(), active: z.boolean().optional(), endDate: z.string().datetime().or(z.string().date()).nullish() })
      .parse(req.body);
    const site = await prisma.site.update({
      where: { id: req.params.id },
      data: { ...body, endDate: body.endDate ? new Date(body.endDate) : undefined },
    });
    res.json(site);
  } catch (e) {
    next(e);
  }
});
