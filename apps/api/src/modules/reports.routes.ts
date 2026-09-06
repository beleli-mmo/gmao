import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireRole('PARK_MANAGER', 'ADMIN'));

const H = 3_600_000;
const round = (n: number, d = 1) => Number(n.toFixed(d));

function periodBounds(period: 'week' | 'month', dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (period === 'month') {
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from, to, label: from.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) };
  }
  // semaine ISO (lundi → dimanche) contenant la date
  const day = (d.getDay() + 6) % 7; // 0 = lundi
  const from = new Date(d);
  from.setDate(d.getDate() - day);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  to.setHours(23, 59, 59, 999);
  const fmt = (x: Date) => x.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  return { from, to, label: `Semaine du ${fmt(from)} au ${fmt(to)} ${to.getFullYear()}` };
}

function tally<T>(rows: T[], key: (r: T) => string, extra?: (r: T) => Partial<Record<string, unknown>>) {
  const m = new Map<string, any>();
  for (const r of rows) {
    const k = key(r);
    const cur = m.get(k) ?? { key: k, count: 0, ...(extra ? extra(r) : {}) };
    cur.count += 1;
    m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

reportsRouter.get('/', async (req, res, next) => {
  try {
    const q = z
      .object({
        period: z.enum(['week', 'month']).default('week'),
        date: z.string().date().optional(),
        siteId: z.string().uuid().optional(),
      })
      .parse(req.query);

    const { from, to, label } = periodBounds(q.period, q.date ?? new Date().toISOString().slice(0, 10));
    const now = new Date();
    const siteWhere = q.siteId ? { siteId: q.siteId } : {};

    const [created, closed, openTickets, costLines, interventions, site] = await Promise.all([
      prisma.ticket.findMany({
        where: { ...siteWhere, createdAtField: { gte: from, lte: to } },
        select: {
          id: true, reference: true, type: true, urgency: true, status: true, title: true,
          createdAtField: true, closedAt: true,
          site: { select: { name: true } },
          lot: { select: { code: true, name: true, color: true } },
          equipment: { select: { name: true } },
        },
      }),
      prisma.ticket.findMany({
        where: { ...siteWhere, closedAt: { gte: from, lte: to } },
        orderBy: { closedAt: 'asc' },
        select: {
          id: true, reference: true, type: true, urgency: true, title: true,
          createdAtField: true, closedAt: true,
          site: { select: { name: true } },
          lot: { select: { name: true } },
          equipment: { select: { name: true } },
          costLines: { select: { amount: true } },
        },
      }),
      prisma.ticket.findMany({
        where: { ...siteWhere, status: { notIn: ['CLOTURE', 'ANNULE'] } },
        select: { createdAtField: true, dueDate: true, urgency: true },
      }),
      prisma.costLine.findMany({
        where: { ...siteWhere, incurredAt: { gte: from, lte: to } },
        select: {
          amount: true, kind: true,
          lot: { select: { name: true, color: true } },
          site: { select: { name: true } },
        },
      }),
      prisma.intervention.findMany({
        where: { endedAt: { gte: from, lte: to }, ...(q.siteId ? { ticket: { siteId: q.siteId } } : {}) },
        select: {
          expectedDeliveryAt: true, endedAt: true, laborHours: true, assigneeKind: true,
          mechanic: { select: { fullName: true } },
          provider: { select: { name: true } },
        },
      }),
      q.siteId ? prisma.site.findUnique({ where: { id: q.siteId }, select: { code: true, name: true } }) : Promise.resolve(null),
    ]);

    // ── DI créées : répartitions ──
    const byStatus = tally(created, (t) => t.status);
    const byUrgency = tally(created, (t) => t.urgency);
    const byType = tally(created, (t) => t.type);
    const byLot = tally(created, (t) => t.lot?.name ?? 'Non affecté', (t) => ({ color: t.lot?.color ?? '#94a3b8' }));
    const bySite = tally(created, (t) => t.site?.name ?? '—');

    // ── DI clôturées : détail + délais ──
    const closedRows = closed.map((t) => {
      const days = t.closedAt ? (t.closedAt.getTime() - new Date(t.createdAtField).getTime()) / (24 * H) : null;
      return {
        reference: t.reference,
        title: t.title,
        type: t.type,
        urgency: t.urgency,
        siteName: t.site?.name ?? '—',
        lotName: t.lot?.name ?? '—',
        assetName: t.equipment?.name ?? '—',
        createdAtField: t.createdAtField,
        closedAt: t.closedAt,
        resolutionDays: days == null ? null : round(days),
        cost: round(t.costLines.reduce((s, c) => s + c.amount, 0), 0),
      };
    });
    const resolved = closedRows.filter((r) => r.resolutionDays != null);
    const avgResolutionDays = resolved.length ? round(resolved.reduce((s, r) => s + (r.resolutionDays ?? 0), 0) / resolved.length) : null;

    // ── Snapshot backlog ──
    const overdue = openTickets.filter((t) => t.dueDate && t.dueDate < now).length;
    const oldestOpen = openTickets.reduce<Date | null>((min, t) => {
      const d = new Date(t.createdAtField);
      return !min || d < min ? d : min;
    }, null);

    // ── TRPP (préventif dont l'échéance tombe dans la période) ──
    const prev = await prisma.ticket.findMany({
      where: { ...siteWhere, type: 'MAINTENANCE_PREVENTIVE', dueDate: { gte: from, lte: to } },
      select: { status: true, dueDate: true, closedAt: true, validatedAt: true, lot: { select: { name: true } } },
    });
    const prevDone = (t: (typeof prev)[number]) => {
      const d = t.closedAt ?? t.validatedAt;
      return !!d && !!t.dueDate && d.getTime() <= t.dueDate.getTime();
    };
    const trppByLot = tally(prev, (t) => t.lot?.name ?? 'Non affecté', () => ({ respected: 0 }));
    for (const t of prev) {
      const row = trppByLot.find((r) => r.key === (t.lot?.name ?? 'Non affecté'));
      if (row && prevDone(t)) row.respected += 1;
    }
    const trpp = {
      total: prev.length,
      respected: prev.filter(prevDone).length,
      overdue: prev.filter((t) => !['CLOTURE', 'VALIDE_TERRAIN'].includes(t.status) && t.dueDate! < now).length,
      pct: prev.length ? round((prev.filter(prevDone).length / prev.length) * 100) : 100,
      byLot: trppByLot.map((r) => ({ ...r, pct: r.count ? round((r.respected / r.count) * 100) : 100 })),
    };

    // ── Coûts ──
    const KIND_LABEL: Record<string, string> = {
      MAIN_OEUVRE: 'Main-d’œuvre', PIECE: 'Pièces', FACTURE_EXTERNE: 'Factures externes', DEPLACEMENT: 'Déplacements',
    };
    const sum = (arr: { amount: number }[]) => round(arr.reduce((s, c) => s + c.amount, 0), 0);
    const costTotal = sum(costLines);
    const costByKind = [...new Set(costLines.map((c) => c.kind))].map((k) => ({
      key: KIND_LABEL[k] ?? k, total: sum(costLines.filter((c) => c.kind === k)),
    })).sort((a, b) => b.total - a.total);
    const costByLot = [...new Set(costLines.map((c) => c.lot?.name ?? 'Non affecté'))].map((n) => ({
      key: n, color: costLines.find((c) => (c.lot?.name ?? 'Non affecté') === n)?.lot?.color ?? '#94a3b8',
      total: sum(costLines.filter((c) => (c.lot?.name ?? 'Non affecté') === n)),
    })).sort((a, b) => b.total - a.total);
    const costBySite = [...new Set(costLines.map((c) => c.site?.name ?? '—'))].map((n) => ({
      key: n, total: sum(costLines.filter((c) => (c.site?.name ?? '—') === n)),
    })).sort((a, b) => b.total - a.total);

    // ── Prestataires / intervenants ──
    const actorName = (iv: (typeof interventions)[number]) =>
      iv.mechanic?.fullName ?? iv.provider?.name ?? (iv.assigneeKind === 'MECHANIC' ? 'Interne' : 'Prestataire');
    const actors = [...new Set(interventions.map(actorName))].map((name) => {
      const list = interventions.filter((iv) => actorName(iv) === name);
      const withTarget = list.filter((iv) => iv.expectedDeliveryAt && iv.endedAt);
      const onTime = withTarget.filter((iv) => iv.endedAt! <= iv.expectedDeliveryAt!).length;
      const isProvider = list.some((iv) => iv.assigneeKind === 'PROVIDER');
      return {
        name, kind: isProvider ? 'Prestataire' : 'Interne',
        count: list.length,
        hours: round(list.reduce((s, iv) => s + (iv.laborHours ?? 0), 0)),
        planRespectPct: withTarget.length ? round((onTime / withTarget.length) * 100) : null,
      };
    }).sort((a, b) => b.count - a.count);

    // ── Top actifs ──
    const topByCount = tally(created.filter((t) => t.equipment), (t) => t.equipment!.name).slice(0, 6);
    const assetCost = new Map<string, number>();
    for (const r of closedRows) if (r.assetName !== '—') assetCost.set(r.assetName, (assetCost.get(r.assetName) ?? 0) + r.cost);
    const topByCost = [...assetCost.entries()].map(([key, total]) => ({ key, total })).sort((a, b) => b.total - a.total).slice(0, 6);

    res.json({
      meta: {
        period: q.period,
        label,
        from: from.toISOString(),
        to: to.toISOString(),
        generatedAt: now.toISOString(),
        scope: site ? `${site.name}` : 'Tous les projets',
      },
      kpis: {
        created: created.length,
        closed: closed.length,
        closureRate: created.length ? round((closed.length / created.length) * 100) : null,
        p1Created: created.filter((t) => t.urgency === 'N1_BLOQUANT').length,
        avgResolutionDays,
        backlogOpen: openTickets.length,
        backlogOverdue: overdue,
        oldestOpen: oldestOpen ? oldestOpen.toISOString() : null,
        trppPct: trpp.pct,
        costTotal,
      },
      breakdowns: { byStatus, byUrgency, byType, byLot, bySite },
      closed: closedRows,
      trpp,
      costs: { total: costTotal, byKind: costByKind, byLot: costByLot, bySite: costBySite },
      actors,
      topAssets: { byCount: topByCount, byCost: topByCost },
    });
  } catch (e) {
    next(e);
  }
});
