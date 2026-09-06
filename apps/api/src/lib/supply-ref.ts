import type { Prisma } from '@prisma/client';

/** Référence d'une demande d'approvisionnement : DA-AAAA-NNNNNN */
export async function nextSupplyReference(tx: Prisma.TransactionClient): Promise<string> {
  const prefix = `DA-${new Date().getFullYear()}-`;
  const last = await tx.supplyRequest.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: 'desc' },
    select: { reference: true },
  });
  const n = last ? Number(last.reference.slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(6, '0');
}

/** Référence de bon de commande : BC-AAAA-NNNNNN */
export async function nextPurchaseOrderRef(tx: Prisma.TransactionClient): Promise<string> {
  const prefix = `BC-${new Date().getFullYear()}-`;
  const last = await tx.supplyRequest.findFirst({
    where: { purchaseOrderRef: { startsWith: prefix } },
    orderBy: { purchaseOrderRef: 'desc' },
    select: { purchaseOrderRef: true },
  });
  const n = last?.purchaseOrderRef ? Number(last.purchaseOrderRef.slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(6, '0');
}
