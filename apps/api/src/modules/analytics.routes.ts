import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth, requireRole('PARK_MANAGER', 'ADMIN'));

/*
 * Implémentation portable (PostgreSQL & SQLite dev) : agrégation via l'API Prisma
 * puis consolidation en mémoire — pas de SQL spécifique à un moteur.
 * Les volumes d'une GMAO BTP (quelques milliers de lignes de coût / an) le permettent ;
 * pour de gros volumes, repasser sur des vues matérialisées côté PostgreSQL.
 */

const REPAIR_STATUSES = ['VALIDE_TERRAIN', 'CLOTURE'] as const;
const hours = (ms: number) => ms / 3_600_000;
const repairedAt = (t: { validatedAt: Date | null; closedAt: Date | null }) => t.validatedAt ?? t.closedAt;

/** Σ durée d'immobilisation (h) par engin sur une fenêtre, pour les pannes critiques. */
async function downtimeByEquipment(from: Date, to: Date) {
  const pannes = await prisma.ticket.findMany({
    where: {
      type: 'PANNE_CRITIQUE',
      status: { in: REPAIR_STATUSES as unknown as any },
      equipmentId: { not: null },
      createdAtField: { gte: from, lte: to },
    },
    select: {
      equipmentId: true,
      createdAtField: true,
      validatedAt: true,
      closedAt: true,
      equipment: { select: { assetTag: true, name: true } },
    },
  });

  const acc = new Map<string, { assetTag: string; name: string; incidents: number; downtimeH: number }>();
  for (const p of pannes) {
    const end = repairedAt(p);
    if (!p.equipmentId || !end) continue;
    const cur = acc.get(p.equipmentId) ?? {
      assetTag: p.equipment!.assetTag,
      name: p.equipment!.name,
      incidents: 0,
      downtimeH: 0,
    };
    cur.incidents += 1;
    cur.downtimeH += Math.max(0, hours(end.getTime() - p.createdAtField.getTime()));
    acc.set(p.equipmentId, cur);
  }
  return acc;
}

/**
 * Coût de maintenance consolidé par chantier (imputation analytique).
 * GET /api/analytics/cost-by-site?from=2026-01-01&to=2026-12-31
 */
analyticsRouter.get('/cost-by-site', async (req, res) => {
  const { from, to } = z.object({ from: z.string().date(), to: z.string().date() }).parse(req.query);
  const lines = await prisma.costLine.findMany({
    where: { incurredAt: { gte: new Date(from), lte: new Date(`${to}T23:59:59`) } },
    select: { kind: true, amount: true, ticketId: true, site: { select: { code: true, name: true } } },
  });

  const agg = new Map<string, { site_code: string; site_name: string; kind: string; total: number; tickets: Set<string> }>();
  for (const l of lines) {
    const key = `${l.site.code}|${l.kind}`;
    const cur = agg.get(key) ?? { site_code: l.site.code, site_name: l.site.name, kind: l.kind, total: 0, tickets: new Set<string>() };
    cur.total += l.amount;
    cur.tickets.add(l.ticketId);
    agg.set(key, cur);
  }
  const rows = [...agg.values()]
    .map((r) => ({ site_code: r.site_code, site_name: r.site_name, kind: r.kind, total: Number(r.total.toFixed(2)), ticket_count: r.tickets.size }))
    .sort((a, b) => a.site_code.localeCompare(b.site_code));
  res.json({ from, to, rows });
});

/**
 * Coût de maintenance par LOT TECHNIQUE (Ascenseurs, SSI, Plomberie…), décomposé par nature.
 * Conforme à la procédure : « répartition des coûts par lot technique et par projet ».
 * GET /api/analytics/cost-by-lot?from=...&to=...
 */
analyticsRouter.get('/cost-by-lot', async (req, res, next) => {
  try {
    const { from, to } = z.object({ from: z.string().date(), to: z.string().date() }).parse(req.query);
    const lines = await prisma.costLine.findMany({
      where: { incurredAt: { gte: new Date(from), lte: new Date(`${to}T23:59:59`) } },
      select: { kind: true, amount: true, ticketId: true, lot: { select: { code: true, name: true, color: true } } },
    });
    const agg = new Map<string, { lot_code: string; lot_name: string; color: string; kind: string; total: number; tickets: Set<string> }>();
    for (const l of lines) {
      const code = l.lot?.code ?? 'NON_AFFECTE';
      const key = `${code}|${l.kind}`;
      const cur = agg.get(key) ?? {
        lot_code: code,
        lot_name: l.lot?.name ?? 'Non affecté à un lot',
        color: l.lot?.color ?? '#94a3b8',
        kind: l.kind,
        total: 0,
        tickets: new Set<string>(),
      };
      cur.total += l.amount;
      cur.tickets.add(l.ticketId);
      agg.set(key, cur);
    }
    const rows = [...agg.values()]
      .map((r) => ({ lot_code: r.lot_code, lot_name: r.lot_name, color: r.color, kind: r.kind, total: Number(r.total.toFixed(2)), ticket_count: r.tickets.size }))
      .sort((a, b) => a.lot_code.localeCompare(b.lot_code));
    res.json({ from, to, rows });
  } catch (e) {
    next(e);
  }
});

/**
 * TRPP — Taux de Respect du Plan Préventif = préventifs clôturés dans les délais / préventifs à échéance.
 * (procédure : objectif > 95 %). Fenêtre = dueDate dans [from, to].
 */
export async function computeTrpp(from: Date, to: Date) {
  const due = await prisma.ticket.findMany({
    where: { type: 'MAINTENANCE_PREVENTIVE', dueDate: { gte: from, lte: to } },
    select: { id: true, status: true, dueDate: true, closedAt: true, validatedAt: true, lot: { select: { code: true, name: true } } },
  });
  const onTime = (t: (typeof due)[number]) => {
    const done = t.closedAt ?? t.validatedAt;
    return !!done && !!t.dueDate && done.getTime() <= t.dueDate.getTime();
  };
  const total = due.length;
  const respected = due.filter(onTime).length;

  const byLot = new Map<string, { lot_code: string; lot_name: string; total: number; respected: number }>();
  for (const t of due) {
    const code = t.lot?.code ?? 'NON_AFFECTE';
    const cur = byLot.get(code) ?? { lot_code: code, lot_name: t.lot?.name ?? 'Non affecté', total: 0, respected: 0 };
    cur.total += 1;
    if (onTime(t)) cur.respected += 1;
    byLot.set(code, cur);
  }
  return {
    total,
    respected,
    overdue: due.filter((t) => !['CLOTURE', 'VALIDE_TERRAIN'].includes(t.status) && t.dueDate! < new Date()).length,
    pct: total ? Number(((respected / total) * 100).toFixed(1)) : 100,
    byLot: [...byLot.values()].map((l) => ({ ...l, pct: l.total ? Number(((l.respected / l.total) * 100).toFixed(1)) : 100 })),
  };
}

analyticsRouter.get('/trpp', async (req, res, next) => {
  try {
    const { from, to } = z.object({ from: z.string().date(), to: z.string().date() }).parse(req.query);
    res.json({ from, to, ...(await computeTrpp(new Date(from), new Date(`${to}T23:59:59`))) });
  } catch (e) {
    next(e);
  }
});

/**
 * TCO par engin = (acquisition + Σ coûts de maintenance) / (heures ou km au compteur).
 * GET /api/analytics/tco?equipmentId=...
 */
analyticsRouter.get('/tco', async (req, res) => {
  const { equipmentId } = z.object({ equipmentId: z.string().uuid().optional() }).parse(req.query);
  const equipment = await prisma.equipment.findMany({
    where: equipmentId ? { id: equipmentId } : undefined,
    select: { id: true, assetTag: true, name: true, acquisitionCost: true, currentMeter: true, costLines: { select: { amount: true } } },
  });

  const rows = equipment
    .map((e) => {
      const maintenance = e.costLines.reduce((s, c) => s + c.amount, 0);
      const acquisition = e.acquisitionCost ?? 0;
      const meter = e.currentMeter ?? 0;
      return {
        asset_tag: e.assetTag,
        name: e.name,
        acquisition,
        maintenance: Number(maintenance.toFixed(2)),
        meter,
        tco_per_unit: meter > 0 ? Number(((acquisition + maintenance) / meter).toFixed(2)) : null,
      };
    })
    .sort((a, b) => (b.tco_per_unit ?? -1) - (a.tco_per_unit ?? -1));
  res.json({ rows });
});

/**
 * MTTR (Mean Time To Repair) + taux d'indisponibilité par engin sur une période.
 * MTTR   = moyenne (repairedAt - createdAtField) sur les pannes critiques réparées
 * Indispo = Σ immobilisation / durée de la période
 * GET /api/analytics/reliability?from=...&to=...
 */
analyticsRouter.get('/reliability', async (req, res) => {
  const { from, to } = z.object({ from: z.string().date(), to: z.string().date() }).parse(req.query);
  const d0 = new Date(from);
  const d1 = new Date(`${to}T23:59:59`);
  const periodH = Math.max(1, hours(d1.getTime() - d0.getTime()));

  const acc = await downtimeByEquipment(d0, d1);
  const rows = [...acc.values()]
    .map((r) => ({
      asset_tag: r.assetTag,
      name: r.name,
      incidents: r.incidents,
      mttr_hours: Number((r.downtimeH / r.incidents).toFixed(1)),
      downtime_hours: Number(r.downtimeH.toFixed(1)),
      unavailability_pct: Number(((r.downtimeH / periodH) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.unavailability_pct - a.unavailability_pct);
  res.json({ from, to, rows });
});

/**
 * Agrégat du tableau de bord admin.
 * GET /api/analytics/overview
 */
analyticsRouter.get('/overview', async (_req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const openStatuses = ['EN_ATTENTE', 'QUALIFIE', 'PLANIFIE', 'EN_COURS', 'TRAVAUX_TERMINES', 'VALIDE_TERRAIN'];

  const [ticketsByStatusRaw, equipmentByStatusRaw, parts, monthCost, blockingTickets, downAcc, fleetCount, trpp] =
    await Promise.all([
      prisma.ticket.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.equipment.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.part.findMany({ where: { active: true }, include: { stock: true } }),
      prisma.costLine.aggregate({ _sum: { amount: true }, where: { incurredAt: { gte: monthStart } } }),
      prisma.ticket.count({ where: { urgency: 'N1_BLOQUANT', status: { in: openStatuses as any } } }),
      downtimeByEquipment(monthStart, now),
      prisma.equipment.count({ where: { status: { not: 'REFORME' } } }),
      computeTrpp(yearStart, now),
    ]);

  const ticketsByStatus = ticketsByStatusRaw.map((r) => ({ status: r.status, count: r._count._all }));
  const periodH = Math.max(1, hours(now.getTime() - monthStart.getTime()));
  const summedRatio = [...downAcc.values()].reduce((s, r) => s + Math.min(r.downtimeH, periodH) / periodH, 0);
  const fleetUnavailabilityPct = fleetCount > 0 ? Number(((summedRatio / fleetCount) * 100).toFixed(1)) : 0;

  res.json({
    openTickets: ticketsByStatus.filter((t) => openStatuses.includes(t.status)).reduce((s, t) => s + t.count, 0),
    blockingTickets,
    ticketsByStatus,
    equipmentByStatus: equipmentByStatusRaw.map((r) => ({ status: r.status, count: r._count._all })),
    fleetUnavailabilityPct,
    partsBelowReorder: parts.filter((p) => Number(p.stock?.onHand ?? 0) <= Number(p.reorderPoint)).length,
    monthMaintenanceCost: Number(monthCost._sum.amount ?? 0),
    trppPct: trpp.pct,
    trppOverdue: trpp.overdue,
    trppTarget: 95,
  });
});

/** VGP / révisions préventives à échéance (calendaire ou compteur). */
analyticsRouter.get('/preventive-due', async (_req, res) => {
  const horizonDays = 30;
  const plans = await prisma.preventivePlan.findMany({
    where: { active: true },
    include: { equipment: { select: { assetTag: true, name: true, currentMeter: true } } },
  });
  const now = Date.now();
  const due = plans.filter((p) => {
    if (p.trigger === 'CALENDAIRE') {
      return p.nextDueDate ? p.nextDueDate.getTime() - now < horizonDays * 864e5 : false;
    }
    return p.nextDueMeter
      ? Number(p.equipment.currentMeter) >= Number(p.nextDueMeter) - Number(p.intervalValue) * 0.1
      : false;
  });
  res.json({ due });
});
