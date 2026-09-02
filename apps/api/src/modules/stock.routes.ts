import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';

export const stockRouter = Router();
stockRouter.use(requireAuth);

// catalogue + niveau de stock + alerte réappro
stockRouter.get('/parts', async (req, res, next) => {
  try {
    const { belowReorder } = z.object({ belowReorder: z.coerce.boolean().optional() }).parse(req.query);
    const parts = await prisma.part.findMany({ where: { active: true }, include: { stock: true }, orderBy: { label: 'asc' } });
    const withFlag = parts.map((p) => ({
      ...p,
      onHand: Number(p.stock?.onHand ?? 0),
      needsReorder: Number(p.stock?.onHand ?? 0) <= Number(p.reorderPoint),
    }));
    res.json({ data: belowReorder ? withFlag.filter((p) => p.needsReorder) : withFlag });
  } catch (e) {
    next(e);
  }
});

// création d'une référence au catalogue (+ stock initial optionnel)
const PartBody = z.object({
  sku: z.string().min(2).max(40),
  label: z.string().min(2),
  category: z.string().optional(),
  unit: z.string().default('U'),
  unitCost: z.number().nonnegative(),
  reorderPoint: z.number().nonnegative().default(0),
  reorderQty: z.number().nonnegative().default(0),
  initialStock: z.number().nonnegative().default(0),
});
stockRouter.post('/parts', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const b = PartBody.parse(req.body);
    const part = await prisma.$transaction(async (tx) => {
      const p = await tx.part.create({
        data: { sku: b.sku, label: b.label, category: b.category, unit: b.unit, unitCost: b.unitCost, reorderPoint: b.reorderPoint, reorderQty: b.reorderQty },
      });
      await tx.stockItem.create({ data: { partId: p.id, onHand: b.initialStock } });
      if (b.initialStock > 0) {
        await tx.stockMovement.create({ data: { partId: p.id, kind: 'ENTREE', quantity: b.initialStock, unitCost: b.unitCost, reference: 'STOCK_INITIAL' } });
      }
      return p;
    });
    res.status(201).json(part);
  } catch (e: any) {
    if (e?.code === 'P2002') return res.status(409).json({ error: 'sku_deja_utilise' });
    next(e);
  }
});

// entrée de stock (réception commande) — recalcule le coût unitaire moyen pondéré (CUMP)
stockRouter.post('/parts/:id/receive', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const { quantity, unitCost, reference } = z
      .object({ quantity: z.number().positive(), unitCost: z.number().nonnegative(), reference: z.string().optional() })
      .parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const part = await tx.part.findUniqueOrThrow({ where: { id: req.params.id }, include: { stock: true } });
      const onHand = Number(part.stock?.onHand ?? 0);
      const cump = onHand + quantity > 0 ? (onHand * Number(part.unitCost) + quantity * unitCost) / (onHand + quantity) : unitCost;
      await tx.part.update({ where: { id: part.id }, data: { unitCost: Number(cump.toFixed(2)) } });
      await tx.stockItem.upsert({
        where: { partId: part.id },
        create: { partId: part.id, onHand: quantity },
        update: { onHand: { increment: quantity } },
      });
      await tx.stockMovement.create({ data: { partId: part.id, kind: 'ENTREE', quantity, unitCost, reference } });
      return { cump: Number(cump.toFixed(2)), onHand: onHand + quantity };
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});
