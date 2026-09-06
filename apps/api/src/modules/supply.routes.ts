import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { nextSupplyReference, nextPurchaseOrderRef } from '../lib/supply-ref';
import { putObject, signedGetUrl } from '../lib/object-store';

export const supplyRouter = Router();
supplyRouter.use(requireAuth);

const SEES_ALL = ['PARK_MANAGER', 'ADMIN', 'DIRECTION', 'CONTROLEUR'];

const detailInclude = {
  site: { select: { id: true, code: true, name: true } },
  requester: { select: { id: true, fullName: true } },
  validatedBy: { select: { fullName: true } },
  receivedBy: { select: { fullName: true } },
  controlledBy: { select: { fullName: true } },
  items: { orderBy: { label: 'asc' as const } },
  events: { orderBy: { createdAt: 'asc' as const }, include: { actor: { select: { fullName: true } } } },
  attachments: { orderBy: { createdAt: 'asc' as const } },
};

/** GET /api/supply[?mine=1&status=] — liste des demandes d'approvisionnement. */
supplyRouter.get('/', async (req, res, next) => {
  try {
    const q = z.object({ mine: z.coerce.boolean().optional(), status: z.string().optional() }).parse(req.query);
    const seesAll = SEES_ALL.includes(req.user!.role);
    const where: any = {};
    if (!seesAll || q.mine) where.requesterId = req.user!.id;
    if (q.status) where.status = { in: q.status.split(',').filter(Boolean) };

    const rows = await prisma.supplyRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, reference: true, status: true, title: true, createdAt: true,
        purchaseOrderRef: true, needBy: true, validatedAt: true, receivedAt: true, controlledAt: true,
        site: { select: { code: true, name: true } },
        requester: { select: { fullName: true } },
        _count: { select: { items: true, attachments: true } },
      },
    });
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

/** GET /api/supply/:id — détail (items, journal, photos de contrôle). */
supplyRouter.get('/:id', async (req, res, next) => {
  try {
    const r = await prisma.supplyRequest.findUnique({ where: { id: req.params.id }, include: detailInclude });
    if (!r) return res.status(404).json({ error: 'introuvable' });
    const seesAll = SEES_ALL.includes(req.user!.role);
    if (!seesAll && r.requesterId !== req.user!.id) return res.status(403).json({ error: 'forbidden' });
    const attachments = await Promise.all(r.attachments.map(async (a) => ({ ...a, url: await signedGetUrl(a.storageKey) })));
    res.json({ ...r, attachments });
  } catch (e) {
    next(e);
  }
});

const ItemBody = z.object({
  label: z.string().min(1).max(200),
  quantity: z.number().positive().default(1),
  unit: z.string().max(12).default('U'),
  note: z.string().max(400).optional(),
});
const CreateBody = z.object({
  siteId: z.string().uuid(),
  title: z.string().min(3).max(160),
  note: z.string().max(2000).optional(),
  needBy: z.string().datetime().or(z.string().date()).optional(),
  items: z.array(ItemBody).min(1).max(40),
});

/** POST /api/supply — le chef de chantier crée et envoie une demande. */
supplyRouter.post('/', requireRole('FIELD_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const b = CreateBody.parse(req.body);
    const created = await prisma.$transaction(async (tx) => {
      const reference = await nextSupplyReference(tx);
      const r = await tx.supplyRequest.create({
        data: {
          reference,
          status: 'DEMANDEE',
          siteId: b.siteId,
          requesterId: req.user!.id,
          title: b.title.trim(),
          note: b.note?.trim() || null,
          needBy: b.needBy ? new Date(b.needBy) : null,
          items: { create: b.items.map((i) => ({ label: i.label.trim(), quantity: i.quantity, unit: i.unit, note: i.note?.trim() || null })) },
          events: { create: { type: 'CREEE', toStatus: 'DEMANDEE', actorId: req.user!.id } },
        },
        include: detailInclude,
      });
      return r;
    });
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

/** PATCH /api/supply/:id — le chef modifie sa demande (statut DEMANDEE ou A_MODIFIER). */
supplyRouter.patch('/:id', requireRole('FIELD_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const b = CreateBody.partial().parse(req.body);
    const cur = await prisma.supplyRequest.findUnique({ where: { id: req.params.id }, select: { requesterId: true, status: true } });
    if (!cur) return res.status(404).json({ error: 'introuvable' });
    if (req.user!.role !== 'ADMIN' && cur.requesterId !== req.user!.id) return res.status(403).json({ error: 'forbidden' });
    if (!['DEMANDEE', 'A_MODIFIER'].includes(cur.status)) return res.status(409).json({ error: 'statut_non_modifiable', message: 'La demande n’est plus modifiable.' });

    const resubmit = cur.status === 'A_MODIFIER';
    const updated = await prisma.$transaction(async (tx) => {
      if (b.items) {
        await tx.supplyItem.deleteMany({ where: { requestId: req.params.id } });
        await tx.supplyItem.createMany({
          data: b.items.map((i) => ({ requestId: req.params.id, label: i.label.trim(), quantity: i.quantity ?? 1, unit: i.unit ?? 'U', note: i.note?.trim() || null })),
        });
      }
      const r = await tx.supplyRequest.update({
        where: { id: req.params.id },
        data: {
          title: b.title?.trim(),
          note: b.note !== undefined ? b.note?.trim() || null : undefined,
          needBy: b.needBy !== undefined ? (b.needBy ? new Date(b.needBy) : null) : undefined,
          status: resubmit ? 'DEMANDEE' : undefined,
        },
        include: detailInclude,
      });
      if (resubmit) await tx.supplyEvent.create({ data: { requestId: r.id, type: 'RESOUMISE', fromStatus: 'A_MODIFIER', toStatus: 'DEMANDEE', actorId: req.user!.id } });
      return r;
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

/** POST /api/supply/:id/review — le directeur technique valide / annule / demande modification. */
const ReviewBody = z.object({ decision: z.enum(['VALIDER', 'ANNULER', 'MODIFIER']), note: z.string().max(2000).optional() });
supplyRouter.post('/:id/review', requireRole('PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const b = ReviewBody.parse(req.body);
    const cur = await prisma.supplyRequest.findUnique({ where: { id: req.params.id }, select: { status: true } });
    if (!cur) return res.status(404).json({ error: 'introuvable' });
    if (!['DEMANDEE', 'A_MODIFIER'].includes(cur.status)) return res.status(409).json({ error: 'statut_invalide' });
    if (b.decision === 'MODIFIER' && !b.note?.trim()) return res.status(422).json({ error: 'motif_requis', message: 'Précisez la modification demandée.' });

    const updated = await prisma.$transaction(async (tx) => {
      if (b.decision === 'VALIDER') {
        const po = await nextPurchaseOrderRef(tx);
        await tx.supplyRequest.update({
          where: { id: req.params.id },
          data: { status: 'VALIDEE', validatedById: req.user!.id, validatedAt: new Date(), reviewNote: b.note?.trim() || null, purchaseOrderRef: po, purchaseOrderAt: new Date() },
        });
        await tx.supplyEvent.create({ data: { requestId: req.params.id, type: 'VALIDEE', fromStatus: cur.status as any, toStatus: 'VALIDEE', actorId: req.user!.id, note: `Bon de commande ${po}` } });
        return tx.supplyRequest.findUniqueOrThrow({ where: { id: req.params.id }, include: detailInclude });
      }
      const to = b.decision === 'ANNULER' ? 'ANNULEE' : 'A_MODIFIER';
      await tx.supplyRequest.update({
        where: { id: req.params.id },
        data: { status: to, reviewNote: b.note?.trim() || null },
      });
      await tx.supplyEvent.create({ data: { requestId: req.params.id, type: b.decision === 'ANNULER' ? 'ANNULEE' : 'MODIF_DEMANDEE', fromStatus: cur.status as any, toStatus: to, actorId: req.user!.id, note: b.note?.trim() || null } });
      return tx.supplyRequest.findUniqueOrThrow({ where: { id: req.params.id }, include: detailInclude });
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

/** POST /api/supply/:id/receive — le chef de chantier confirme la réception. */
supplyRouter.post('/:id/receive', requireRole('FIELD_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const cur = await prisma.supplyRequest.findUnique({ where: { id: req.params.id }, select: { requesterId: true, status: true } });
    if (!cur) return res.status(404).json({ error: 'introuvable' });
    if (req.user!.role !== 'ADMIN' && cur.requesterId !== req.user!.id) return res.status(403).json({ error: 'forbidden' });
    if (cur.status !== 'VALIDEE') return res.status(409).json({ error: 'statut_invalide', message: 'La demande doit être validée avant réception.' });
    const r = await prisma.$transaction(async (tx) => {
      await tx.supplyRequest.update({ where: { id: req.params.id }, data: { status: 'RECUE', receivedById: req.user!.id, receivedAt: new Date() } });
      await tx.supplyEvent.create({ data: { requestId: req.params.id, type: 'RECUE', fromStatus: 'VALIDEE', toStatus: 'RECUE', actorId: req.user!.id } });
      return tx.supplyRequest.findUniqueOrThrow({ where: { id: req.params.id }, include: detailInclude });
    });
    res.json(r);
  } catch (e) {
    next(e);
  }
});

/** POST /api/supply/:id/control — contrôle terrain : 1 à 3 photos + clôture. */
const Photo = z.object({ mimeType: z.string(), dataBase64: z.string() });
const ControlBody = z.object({ note: z.string().max(2000).optional(), photos: z.array(Photo).min(1).max(3) });
supplyRouter.post('/:id/control', requireRole('CONTROLEUR', 'PARK_MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const b = ControlBody.parse(req.body);
    const cur = await prisma.supplyRequest.findUnique({ where: { id: req.params.id }, select: { status: true, reference: true } });
    if (!cur) return res.status(404).json({ error: 'introuvable' });
    if (cur.status !== 'RECUE') return res.status(409).json({ error: 'statut_invalide', message: 'La réception doit être confirmée avant le contrôle.' });

    const uploaded: { storageKey: string; mimeType: string; sizeBytes: number }[] = [];
    for (const [i, p] of b.photos.entries()) {
      const buf = Buffer.from(p.dataBase64, 'base64');
      const ext = (p.mimeType.split('/')[1] || 'jpg').split(';')[0];
      const key = `supply/${req.params.id}/controle-${i + 1}.${ext}`;
      await putObject(key, buf, p.mimeType);
      uploaded.push({ storageKey: key, mimeType: p.mimeType, sizeBytes: buf.length });
    }

    const r = await prisma.$transaction(async (tx) => {
      await tx.supplyAttachment.createMany({ data: uploaded.map((u) => ({ requestId: req.params.id, ...u })) });
      await tx.supplyRequest.update({
        where: { id: req.params.id },
        data: { status: 'CLOTUREE', controlledById: req.user!.id, controlledAt: new Date(), controlNote: b.note?.trim() || null },
      });
      await tx.supplyEvent.create({ data: { requestId: req.params.id, type: 'CONTROLEE', fromStatus: 'RECUE', toStatus: 'CLOTUREE', actorId: req.user!.id, note: b.note?.trim() || `${uploaded.length} photo(s) de contrôle` } });
      return tx.supplyRequest.findUniqueOrThrow({ where: { id: req.params.id }, include: detailInclude });
    });
    res.json(r);
  } catch (e) {
    next(e);
  }
});
