/**
 * Indicateurs de respect du planning à partir d'une liste d'interventions.
 * Partagé par les fiches prestataire (externe) et technicien interne.
 */
const DAY = 86_400_000;

export interface IvForKpi {
  scheduledFor: Date | null;
  expectedDeliveryAt: Date | null;
  endedAt: Date | null;
  laborHours: number | null;
}

export interface PlanKpis {
  total: number;
  done: number;
  open: number;
  withTarget: number;
  onTime: number;
  planRespectPct: number | null;
  avgDelayDays: number | null;
  totalHours: number;
}

export function planKpis(ivs: IvForKpi[]): PlanKpis {
  const done = ivs.filter((i) => i.endedAt);
  const withTarget = done.filter((i) => i.expectedDeliveryAt);
  const onTime = withTarget.filter((i) => i.endedAt! <= i.expectedDeliveryAt!);
  const delays = withTarget.map((i) => Math.max(0, (i.endedAt!.getTime() - i.expectedDeliveryAt!.getTime()) / DAY));
  return {
    total: ivs.length,
    done: done.length,
    open: ivs.length - done.length,
    withTarget: withTarget.length,
    onTime: onTime.length,
    planRespectPct: withTarget.length ? Math.round((onTime.length / withTarget.length) * 1000) / 10 : null,
    avgDelayDays: delays.length ? Math.round((delays.reduce((s, d) => s + d, 0) / delays.length) * 10) / 10 : null,
    totalHours: done.reduce((s, i) => s + (i.laborHours ?? 0), 0),
  };
}

type IvWithTicket = IvForKpi & {
  id: string;
  ticketId: string;
  startedAt: Date | null;
  travelKm: number | null;
  report: string | null;
  ticket: {
    id: string;
    reference: string;
    title: string;
    status: string;
    urgency: string;
    site: { name: string } | null;
    equipment: { name: string } | null;
  } | null;
};

/** Ligne d'historique normalisée pour l'admin. */
export function toHistoryRow(iv: IvWithTicket) {
  const late = iv.endedAt && iv.expectedDeliveryAt ? iv.endedAt > iv.expectedDeliveryAt : null;
  const delayDays = iv.endedAt && iv.expectedDeliveryAt
    ? Math.round(((iv.endedAt.getTime() - iv.expectedDeliveryAt.getTime()) / DAY) * 10) / 10
    : null;
  return {
    id: iv.id,
    ticketId: iv.ticket?.id ?? iv.ticketId,
    reference: iv.ticket?.reference ?? null,
    title: iv.ticket?.title ?? null,
    ticketStatus: iv.ticket?.status ?? null,
    urgency: iv.ticket?.urgency ?? null,
    siteName: iv.ticket?.site?.name ?? null,
    assetName: iv.ticket?.equipment?.name ?? null,
    scheduledFor: iv.scheduledFor,
    expectedDeliveryAt: iv.expectedDeliveryAt,
    startedAt: iv.startedAt,
    endedAt: iv.endedAt,
    laborHours: iv.laborHours,
    travelKm: iv.travelKm,
    report: iv.report,
    onTime: late === null ? null : !late,
    delayDays,
  };
}

export const interventionHistoryInclude = {
  orderBy: [{ scheduledFor: 'desc' as const }],
  include: {
    ticket: {
      select: {
        id: true, reference: true, title: true, status: true, urgency: true,
        site: { select: { name: true } },
        equipment: { select: { name: true } },
      },
    },
  },
};
