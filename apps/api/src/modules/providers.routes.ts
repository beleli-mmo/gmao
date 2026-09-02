import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';

export const providersRouter = Router();
providersRouter.use(requireAuth);

providersRouter.get('/', async (_req, res, next) => {
  try {
    const data = await prisma.provider.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, contactName: true, phone: true, email: true, specialties: true },
    });
    res.json({ data });
  } catch (e) {
    next(e);
  }
});

const ProviderBody = z.object({
  name: z.string().min(2),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

providersRouter.post('/', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const b = ProviderBody.parse(req.body);
    const p = await prisma.provider.create({ data: b });
    res.status(201).json(p);
  } catch (e) {
    next(e);
  }
});
