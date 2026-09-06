import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';

export const vehiclesRouter = Router();
vehiclesRouter.use(requireAuth);

const CAN_READ = requireRole('PARK_MANAGER', 'ADMIN', 'DIRECTION');
const CAN_WRITE = requireRole('PARK_MANAGER', 'ADMIN');
const DAY = 86_400_000;

async function nextVehicleRef(tx: Prisma.TransactionClient): Promise<string> {
  const prefix = `VH-${new Date().getFullYear()}-`;
  const last = await tx.vehicle.findFirst({ where: { reference: { startsWith: prefix } }, orderBy: { reference: 'desc' }, select: { reference: true } });
  const n = last ? Number(last.reference.slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(3, '0');
}

const dLeft = (d: Date | null | undefined) => (d ? Math.round((new Date(d).getTime() - Date.now()) / DAY) : null);

/** Résumé d'échéances pour un véhicule (à partir des relations chargées). */
function summarize(v: any) {
  const ins = [...(v.insurances ?? [])].sort((a: any, b: any) => +new Date(b.endDate) - +new Date(a.endDate))[0] ?? null;
  const insp = [...(v.inspections ?? [])].sort((a: any, b: any) => +new Date(b.validUntil) - +new Date(a.validUntil))[0] ?? null;
  const nextServiceKm = v.lastServiceKm != null ? v.lastServiceKm + (v.serviceIntervalKm || 10000) : null;
  return {
    insuranceEndDate: ins?.endDate ?? null,
    insuranceDaysLeft: dLeft(ins?.endDate),
    insurer: ins?.insurer ?? null,
    inspectionValidUntil: insp?.validUntil ?? null,
    inspectionDaysLeft: dLeft(insp?.validUntil),
    nextServiceKm,
    kmToService: nextServiceKm != null ? Math.round(nextServiceKm - (v.currentKm || 0)) : null,
  };
}

/** GET /api/vehicles — liste + échéances. */
vehiclesRouter.get('/', CAN_READ, async (_req, res, next) => {
  try {
    const rows = await prisma.vehicle.findMany({
      orderBy: [{ active: 'desc' }, { plate: 'asc' }],
      include: {
        site: { select: { name: true } },
        insurances: { select: { endDate: true, insurer: true } },
        inspections: { select: { validUntil: true } },
      },
    });
    res.json({ data: rows.map((v) => ({ ...v, insurances: undefined, inspections: undefined, ...summarize(v) })) });
  } catch (e) {
    next(e);
  }
});

/** GET /api/vehicles/alerts — pour le tableau de bord. */
vehiclesRouter.get('/alerts', CAN_READ, async (_req, res, next) => {
  try {
    const rows = await prisma.vehicle.findMany({
      where: { active: true },
      select: {
        id: true, reference: true, plate: true, brand: true, model: true, assignedName: true,
        insurances: { select: { endDate: true, insurer: true } },
        inspections: { select: { validUntil: true } },
      },
    });
    const insurance: any[] = [];
    const inspection: any[] = [];
    for (const v of rows) {
      const s = summarize(v);
      if (s.insuranceDaysLeft != null && s.insuranceDaysLeft <= 30) {
        insurance.push({ id: v.id, plate: v.plate, label: [v.brand, v.model].filter(Boolean).join(' '), assignedName: v.assignedName, endDate: s.insuranceEndDate, daysLeft: s.insuranceDaysLeft, insurer: s.insurer });
      }
      if (s.inspectionDaysLeft != null && s.inspectionDaysLeft <= 15) {
        inspection.push({ id: v.id, plate: v.plate, label: [v.brand, v.model].filter(Boolean).join(' '), assignedName: v.assignedName, validUntil: s.inspectionValidUntil, daysLeft: s.inspectionDaysLeft });
      }
    }
    insurance.sort((a, b) => a.daysLeft - b.daysLeft);
    inspection.sort((a, b) => a.daysLeft - b.daysLeft);
    res.json({ insurance, inspection, insuranceCount: insurance.length, inspectionCount: inspection.length });
  } catch (e) {
    next(e);
  }
});

/** GET /api/vehicles/:id — fiche complète. */
vehiclesRouter.get('/:id', CAN_READ, async (req, res, next) => {
  try {
    const v = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      include: {
        site: { select: { id: true, name: true } },
        assignedUser: { select: { fullName: true } },
        insurances: { orderBy: { endDate: 'desc' } },
        inspections: { orderBy: { validUntil: 'desc' } },
        odometerReadings: { orderBy: { readAt: 'desc' }, take: 20, include: { recordedBy: { select: { fullName: true } } } },
        services: { orderBy: { performedAt: 'desc' } },
      },
    });
    if (!v) return res.status(404).json({ error: 'introuvable' });
    res.json({ ...v, ...summarize(v) });
  } catch (e) {
    next(e);
  }
});

const VehicleBody = z.object({
  plate: z.string().min(2).max(24),
  brand: z.string().max(60).nullish(),
  model: z.string().max(60).nullish(),
  year: z.number().int().min(1980).max(2100).nullish(),
  category: z.string().max(30).nullish(),
  fuel: z.string().max(20).nullish(),
  siteId: z.string().uuid().nullish(),
  currentKm: z.number().nonnegative().optional(),
  serviceIntervalKm: z.number().positive().optional(),
  assignedName: z.string().max(120).nullish(),
  assignedFunction: z.string().max(120).nullish(),
  active: z.boolean().optional(),
});

vehiclesRouter.post('/', CAN_WRITE, async (req, res, next) => {
  try {
    const b = VehicleBody.parse(req.body);
    const v = await prisma.$transaction(async (tx) => {
      const reference = await nextVehicleRef(tx);
      return tx.vehicle.create({ data: { ...b, plate: b.plate.trim().toUpperCase(), reference } });
    });
    res.status(201).json(v);
  } catch (e: any) {
    if (e?.code === 'P2002') return res.status(409).json({ error: 'immatriculation_deja_utilisee' });
    next(e);
  }
});

vehiclesRouter.patch('/:id', CAN_WRITE, async (req, res, next) => {
  try {
    const b = VehicleBody.partial().parse(req.body);
    const v = await prisma.vehicle.update({
      where: { id: req.params.id },
      data: { ...b, plate: b.plate ? b.plate.trim().toUpperCase() : undefined },
    });
    res.json(v);
  } catch (e: any) {
    if (e?.code === 'P2002') return res.status(409).json({ error: 'immatriculation_deja_utilisee' });
    next(e);
  }
});

vehiclesRouter.delete('/:id', CAN_WRITE, async (req, res, next) => {
  try {
    const c = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      select: { _count: { select: { insurances: true, inspections: true, services: true, odometerReadings: true } } },
    });
    if (!c) return res.status(404).json({ error: 'introuvable' });
    const total = c._count.insurances + c._count.inspections + c._count.services + c._count.odometerReadings;
    if (total > 0) return res.status(409).json({ error: 'vehicule_avec_historique', message: 'Ce véhicule a un historique (assurances, visites, relevés). Désactivez-le plutôt que de le supprimer.' });
    await prisma.vehicle.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ── enregistrements ──────────────────────────────────────────────────
const dateish = z.string().datetime().or(z.string().date());

vehiclesRouter.post('/:id/insurance', CAN_WRITE, async (req, res, next) => {
  try {
    const b = z.object({
      insurer: z.string().min(2), policyNo: z.string().nullish(),
      startDate: dateish.nullish(), endDate: dateish, premium: z.number().nonnegative().nullish(), note: z.string().nullish(),
    }).parse(req.body);
    const row = await prisma.vehicleInsurance.create({
      data: { vehicleId: req.params.id, insurer: b.insurer.trim(), policyNo: b.policyNo?.trim() || null, startDate: b.startDate ? new Date(b.startDate) : null, endDate: new Date(b.endDate), premium: b.premium ?? null, note: b.note?.trim() || null },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

vehiclesRouter.post('/:id/inspection', CAN_WRITE, async (req, res, next) => {
  try {
    const b = z.object({
      performedAt: dateish, validUntil: dateish, center: z.string().nullish(),
      result: z.string().nullish(), cost: z.number().nonnegative().nullish(), note: z.string().nullish(),
    }).parse(req.body);
    const row = await prisma.vehicleInspection.create({
      data: { vehicleId: req.params.id, performedAt: new Date(b.performedAt), validUntil: new Date(b.validUntil), center: b.center?.trim() || null, result: b.result?.trim() || null, cost: b.cost ?? null, note: b.note?.trim() || null },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

vehiclesRouter.post('/:id/odometer', CAN_WRITE, async (req, res, next) => {
  try {
    const b = z.object({ km: z.number().nonnegative(), readAt: dateish.optional(), note: z.string().nullish() }).parse(req.body);
    const row = await prisma.$transaction(async (tx) => {
      const r = await tx.odometerReading.create({ data: { vehicleId: req.params.id, km: b.km, readAt: b.readAt ? new Date(b.readAt) : new Date(), recordedById: req.user!.id, note: b.note?.trim() || null } });
      const v = await tx.vehicle.findUnique({ where: { id: req.params.id }, select: { currentKm: true } });
      if (v && b.km > v.currentKm) await tx.vehicle.update({ where: { id: req.params.id }, data: { currentKm: b.km } });
      return r;
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

vehiclesRouter.post('/:id/service', CAN_WRITE, async (req, res, next) => {
  try {
    const b = z.object({
      kind: z.string().default('VIDANGE'), performedAt: dateish, km: z.number().nonnegative(),
      nextDueKm: z.number().nonnegative().nullish(), garage: z.string().nullish(),
      cost: z.number().nonnegative().nullish(), note: z.string().nullish(),
    }).parse(req.body);
    const row = await prisma.$transaction(async (tx) => {
      const r = await tx.vehicleService.create({
        data: { vehicleId: req.params.id, kind: b.kind, performedAt: new Date(b.performedAt), km: b.km, nextDueKm: b.nextDueKm ?? null, garage: b.garage?.trim() || null, cost: b.cost ?? null, note: b.note?.trim() || null },
      });
      const v = await tx.vehicle.findUnique({ where: { id: req.params.id }, select: { currentKm: true } });
      await tx.vehicle.update({
        where: { id: req.params.id },
        data: { lastServiceKm: b.km, lastServiceAt: new Date(b.performedAt), currentKm: v && b.km > v.currentKm ? b.km : undefined },
      });
      return r;
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

// suppression d'un enregistrement (assurance / visite / vidange / relevé)
vehiclesRouter.delete('/record/:kind/:rid', CAN_WRITE, async (req, res, next) => {
  try {
    const { kind, rid } = req.params;
    const map: Record<string, any> = {
      insurance: prisma.vehicleInsurance, inspection: prisma.vehicleInspection,
      service: prisma.vehicleService, odometer: prisma.odometerReading,
    };
    const model = map[kind];
    if (!model) return res.status(400).json({ error: 'type_inconnu' });
    await model.delete({ where: { id: rid } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
