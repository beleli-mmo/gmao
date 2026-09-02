import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Imputation analytique : consolide toutes les dépenses d'un ticket en CostLine,
 * chacune rattachée au chantier (Site.code = code analytique).
 *
 * Sources agrégées :
 *  - Main d'œuvre : Intervention.laborHours * laborRate (mécano interne)
 *  - Déplacement  : Intervention.travelKm * tarif km  (+ forfait éventuel)
 *  - Pièces       : TicketPart.qtyConsumed * unitCost
 *  - Externe      : ExternalInvoice.amountHT (+ TVA si non récupérable)
 *
 * Idempotent : on efface les lignes non verrouillées puis on régénère.
 * Appelée à chaque passage TRAVAUX_TERMINES et figée (locked=true) à la CLÔTURE.
 */
export async function recomputeTicketCosts(
  tx: PrismaClient | Prisma.TransactionClient,
  ticketId: string,
  opts: { lock?: boolean; kmRate?: number } = {},
): Promise<{ total: number; byKind: Record<string, number> }> {
  const kmRate = opts.kmRate ?? Number(process.env.TRAVEL_KM_RATE ?? 0.35);

  const ticket = await tx.ticket.findUniqueOrThrow({
    where: { id: ticketId },
    include: {
      interventions: true,
      requestedParts: true,
      externalInvoices: true,
    },
  });

  await tx.costLine.deleteMany({ where: { ticketId, locked: false } });

  const lines: Prisma.CostLineCreateManyInput[] = [];
  const push = (
    kind: Prisma.CostLineCreateManyInput['kind'],
    label: string,
    quantity: number,
    unitAmount: number,
  ) => {
    if (quantity <= 0 || unitAmount === 0) return;
    lines.push({
      ticketId,
      siteId: ticket.siteId,
      equipmentId: ticket.equipmentId ?? undefined,
      lotId: ticket.lotId ?? undefined,
      kind,
      label,
      quantity,
      unitAmount,
      amount: Number((quantity * unitAmount).toFixed(2)),
      locked: opts.lock ?? false,
    });
  };

  for (const iv of ticket.interventions) {
    if (iv.laborHours && iv.laborRate) {
      push('MAIN_OEUVRE', `Main d'œuvre (${iv.assigneeKind})`, Number(iv.laborHours), Number(iv.laborRate));
    }
    if (iv.travelKm) push('DEPLACEMENT', 'Déplacement mécanicien', Number(iv.travelKm), kmRate);
  }

  for (const tp of ticket.requestedParts) {
    if (tp.qtyConsumed && Number(tp.qtyConsumed) > 0) {
      push('PIECE', `Pièce ${tp.partId}`, Number(tp.qtyConsumed), Number(tp.unitCost));
    }
  }

  for (const inv of ticket.externalInvoices) {
    push('FACTURE_EXTERNE', `Facture ${inv.invoiceRef}`, 1, Number(inv.amountHT) + Number(inv.vatAmount));
  }

  if (lines.length) await tx.costLine.createMany({ data: lines });

  const all = await tx.costLine.findMany({ where: { ticketId } });
  const byKind: Record<string, number> = {};
  let total = 0;
  for (const l of all) {
    const a = Number(l.amount);
    total += a;
    byKind[l.kind] = (byKind[l.kind] ?? 0) + a;
  }
  return { total: Number(total.toFixed(2)), byKind };
}
