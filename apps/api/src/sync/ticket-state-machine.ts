import type { Prisma, PrismaClient, TicketStatus } from '@prisma/client';
import { assertTransition } from '../shared';
import type { Role } from '../shared';
import { recomputeTicketCosts } from '../lib/cost-imputation';

const NOW_FIELD: Partial<Record<TicketStatus, string>> = {
  QUALIFIE: 'qualifiedAt',
  PLANIFIE: 'plannedAt',
  EN_COURS: 'startedAt',
  TRAVAUX_TERMINES: 'workDoneAt',
  VALIDE_TERRAIN: 'validatedAt',
  CLOTURE: 'closedAt',
};

/**
 * Applique une transition de statut ticket dans une transaction :
 *  - vérifie la légalité (machine à états + rôle)
 *  - journalise TicketEvent
 *  - déclenche les effets de bord (recalcul coûts, MAJ statut engin, mouvements stock)
 */
export async function applyTransition(
  tx: Prisma.TransactionClient,
  params: {
    ticketId: string;
    to: TicketStatus;
    actor: { id: string; role: Role };
    note?: string;
    origin?: 'API' | 'SYNC';
  },
): Promise<void> {
  const { ticketId, to, actor, note, origin = 'API' } = params;
  const ticket = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  const from = ticket.status;
  if (from === to) return;

  assertTransition(from as unknown as any, to as unknown as any, actor.role);

  const data: Prisma.TicketUpdateInput = { status: to };
  const tsField = NOW_FIELD[to];
  if (tsField) (data as Record<string, unknown>)[tsField] = new Date();

  await tx.ticket.update({ where: { id: ticketId }, data });
  await tx.ticketEvent.create({
    data: { ticketId, fromStatus: from, toStatus: to, actorId: actor.id, note, origin },
  });

  // ── effets de bord ────────────────────────────────────────────────
  if (to === 'EN_COURS' && ticket.equipmentId) {
    await tx.equipment.update({ where: { id: ticket.equipmentId }, data: { status: 'EN_MAINTENANCE' } });
  }

  if (to === 'TRAVAUX_TERMINES') {
    await recomputeTicketCosts(tx as unknown as PrismaClient, ticketId, { lock: false });
  }

  if (to === 'CLOTURE') {
    await recomputeTicketCosts(tx as unknown as PrismaClient, ticketId, { lock: true });
    if (ticket.equipmentId) {
      await tx.equipment.update({
        where: { id: ticket.equipmentId },
        data: { status: 'EN_SERVICE' },
      });
      // avance le plan préventif si le ticket y était rattaché
      if (ticket.preventivePlanId && ticket.meterAtReport != null) {
        const plan = await tx.preventivePlan.findUnique({ where: { id: ticket.preventivePlanId } });
        if (plan) {
          const next =
            plan.trigger === 'CALENDAIRE'
              ? { nextDueDate: addDays(new Date(), Number(plan.intervalValue)), lastDoneDate: new Date() }
              : {
                  lastDoneMeter: ticket.meterAtReport,
                  nextDueMeter: Number(ticket.meterAtReport) + Number(plan.intervalValue),
                };
          await tx.preventivePlan.update({ where: { id: plan.id }, data: next });
        }
      }
    }
  }

  if (to === 'ANNULE' && ticket.equipmentId) {
    await tx.equipment.update({ where: { id: ticket.equipmentId }, data: { status: 'EN_SERVICE' } });
  }
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
