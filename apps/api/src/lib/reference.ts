import type { Prisma } from '@prisma/client';

/**
 * Génère une référence lisible `DI-AAAA-NNNNNN`, portable PostgreSQL / SQLite
 * (pas de séquence SQL). À utiliser dans une transaction ; en cas de collision
 * sur l'unique `reference`, l'appelant réessaie.
 */
export async function nextTicketReference(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `DI-${year}-`;
  const last = await tx.ticket.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: 'desc' },
    select: { reference: true },
  });
  const n = last ? Number(last.reference.slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(6, '0');
}
