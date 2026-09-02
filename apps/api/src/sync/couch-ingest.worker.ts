/**
 * Worker d'ingestion CouchDB → PostgreSQL.
 *
 * Écoute le flux `_changes` continu de la base CouchDB `field-tickets` (celle vers
 * laquelle les PWA terrain répliquent). Pour chaque document :
 *   1. dédup via SyncLog (couchId + couchRev)  → idempotence sur rejeu du flux
 *   2. validation de schéma (Zod)              → doc invalide = REJECTED, on n'échoue pas le flux
 *   3. résolution d'idempotence métier via clientId → upsert du Ticket
 *   4. rejeu des transitions terrain via la machine à états (rôle = reporter)
 *   5. import des pièces jointes CouchDB → S3/MinIO + TicketAttachment
 *   6. persistance du checkpoint `since` (séquence) pour reprise après crash
 *
 * Lancé comme process séparé : `node dist/sync/couch-ingest.worker.js`
 */
import nano from 'nano';
import { z } from 'zod';
import { prisma } from '../prisma';
import { FieldTicketDoc } from '@gmao/shared';
import { applyTransition } from './ticket-state-machine';
import { putObject } from '../lib/object-store';
import { broadcast } from '../realtime';

const COUCH_URL = process.env.COUCH_URL ?? 'http://admin:admin@localhost:5984';
const DB_NAME = process.env.COUCH_FIELD_DB ?? 'field-tickets';
const CHECKPOINT_ID = 'ingest-checkpoint';

const couch = nano(COUCH_URL);
const db = couch.db.use(DB_NAME);
const meta = couch.db.use(process.env.COUCH_META_DB ?? 'sync-meta');

type ChangeRow = { id: string; changes: { rev: string }[]; doc?: any; seq: string; deleted?: boolean };

async function loadCheckpoint(): Promise<string | undefined> {
  try {
    const doc = (await meta.get(CHECKPOINT_ID)) as any;
    return doc.since as string;
  } catch {
    return undefined;
  }
}

async function saveCheckpoint(since: string) {
  let rev: string | undefined;
  try {
    rev = ((await meta.get(CHECKPOINT_ID)) as any)._rev;
  } catch {
    /* first write */
  }
  await meta.insert({ _id: CHECKPOINT_ID, _rev: rev, since, updatedAt: new Date().toISOString() } as any);
}

/** Traite un document `ticket:*` venu du terrain. */
async function ingestTicketDoc(row: ChangeRow): Promise<'APPLIED' | 'REJECTED' | 'SKIPPED'> {
  const rev = row.changes[0]?.rev ?? row.doc?._rev;

  // 1. dédup
  const seen = await prisma.syncLog.findUnique({ where: { couchId_couchRev: { couchId: row.id, couchRev: rev } } });
  if (seen) return 'SKIPPED';

  if (row.deleted) {
    await prisma.syncLog.create({ data: { couchId: row.id, couchRev: rev, docType: 'ticket', status: 'SKIPPED', reason: 'deleted', seq: row.seq } });
    return 'SKIPPED';
  }

  // 2. validation de schéma
  let doc: z.infer<typeof FieldTicketDoc>;
  try {
    doc = FieldTicketDoc.parse(row.doc);
  } catch (err) {
    await prisma.syncLog.create({
      data: { couchId: row.id, couchRev: rev, docType: 'ticket', clientId: row.doc?.clientId, status: 'REJECTED', reason: `schema: ${(err as Error).message}`.slice(0, 500), seq: row.seq },
    });
    return 'REJECTED';
  }

  // garde-fou : le reporter doit exister et être chef de chantier
  const reporter = await prisma.user.findUnique({ where: { id: doc.reporterId } });
  if (!reporter || reporter.role !== 'FIELD_MANAGER') {
    await prisma.syncLog.create({ data: { couchId: row.id, couchRev: rev, docType: 'ticket', clientId: doc.clientId, status: 'REJECTED', reason: 'reporter invalide', seq: row.seq } });
    return 'REJECTED';
  }

  await prisma.$transaction(async (tx) => {
    // 3. upsert idempotent par clientId
    const existing = await tx.ticket.findUnique({ where: { clientId: doc.clientId } });

    let ticketId: string;
    if (!existing) {
      const reference = await nextReference(tx);
      const created = await tx.ticket.create({
        data: {
          reference,
          clientId: doc.clientId,
          type: doc.ticketType as any,
          urgency: doc.urgency as any,
          status: 'CREE',
          title: doc.title,
          description: doc.description,
          siteId: doc.siteId,
          equipmentId: doc.equipmentId ?? null,
          reporterId: doc.reporterId,
          meterAtReport: doc.meterValue ?? null,
          createdAtField: new Date(doc.createdAtField),
        },
      });
      ticketId = created.id;

      // relevé compteur
      if (doc.equipmentId && doc.meterValue != null && doc.meterKind !== 'NONE') {
        await tx.meterReading.create({
          data: { equipmentId: doc.equipmentId, value: doc.meterValue, kind: doc.meterKind as any, source: 'FIELD', recordedById: doc.reporterId, ticketId },
        });
        await tx.equipment.update({ where: { id: doc.equipmentId }, data: { currentMeter: doc.meterValue } });
      }

      // pièces demandées
      for (const rp of doc.requestedParts) {
        const part = await tx.part.findUnique({ where: { id: rp.partId } });
        if (part) {
          await tx.ticketPart.create({ data: { ticketId, partId: rp.partId, qtyRequested: rp.qty, unitCost: part.unitCost } });
        }
      }

      // 4. transition terrain : CREE → EN_ATTENTE (rôle FIELD_MANAGER)
      await applyTransition(tx, { ticketId, to: 'EN_ATTENTE', actor: { id: doc.reporterId, role: 'FIELD_MANAGER' }, origin: 'SYNC', note: 'création terrain (synchro)' });

      // panne critique bloquante → engin déclaré en panne
      if (doc.ticketType === 'PANNE_CRITIQUE' && doc.urgency === 'N1_BLOQUANT' && doc.equipmentId) {
        await tx.equipment.update({ where: { id: doc.equipmentId }, data: { status: 'EN_PANNE' } });
      }
    } else {
      ticketId = existing.id;
    }

    // 5. pièces jointes (photos/vidéos/notes vocales)
    for (const m of doc.media) {
      const already = await tx.ticketAttachment.findFirst({ where: { ticketId, couchAttId: `${row.id}/${m.attName}` } });
      if (already) continue;
      const buf = await db.attachment.get(row.id, m.attName);
      const key = `tickets/${ticketId}/${m.attName}`;
      await putObject(key, buf as Buffer, m.mimeType);
      await tx.ticketAttachment.create({
        data: { ticketId, kind: m.kind as any, storageKey: key, couchAttId: `${row.id}/${m.attName}`, mimeType: m.mimeType, sizeBytes: m.sizeBytes, capturedAt: m.capturedAt ? new Date(m.capturedAt) : null },
      });
    }

    // 6. validation terrain signée hors ligne → TRAVAUX_TERMINES ⇒ VALIDE_TERRAIN
    if (doc.localStatus === 'VALIDE_TERRAIN' && doc.fieldSignature) {
      const t = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId } });
      if (t.status === 'TRAVAUX_TERMINES') {
        const sigBuf = await db.attachment.get(row.id, doc.fieldSignature.attName);
        const sigKey = `signatures/${ticketId}.png`;
        await putObject(sigKey, sigBuf as Buffer, 'image/png');
        await tx.ticketSignature.upsert({
          where: { ticketId },
          create: { ticketId, signerId: doc.reporterId, signerName: doc.fieldSignature.signerName, signatureKey: sigKey, signedAt: new Date(doc.fieldSignature.signedAt) },
          update: { signatureKey: sigKey },
        });
        await applyTransition(tx, { ticketId, to: 'VALIDE_TERRAIN', actor: { id: doc.reporterId, role: 'FIELD_MANAGER' }, origin: 'SYNC', note: 'validation terrain (synchro)' });
      }
      // si le ticket n'est pas encore TRAVAUX_TERMINES, on ne fait rien :
      // le doc sera re-traité au prochain _changes une fois le bureau à jour (rev inchangée → géré via clientId).
    }

    await tx.syncLog.create({ data: { couchId: row.id, couchRev: rev, docType: 'ticket', clientId: doc.clientId, status: 'APPLIED', seq: row.seq } });
  });

  broadcast({ type: 'ticket.synced', clientId: doc.clientId });
  return 'APPLIED';
}

/** Génère une référence lisible TK-AAAA-NNNNNN (compteur annuel). */
async function nextReference(tx: any): Promise<string> {
  const year = new Date().getFullYear();
  const [{ nextval }] = await tx.$queryRawUnsafe<{ nextval: bigint }[]>(
    `SELECT nextval('ticket_ref_${year}_seq') AS nextval`,
  ).catch(async () => {
    await tx.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS ticket_ref_${year}_seq START 1`);
    return tx.$queryRawUnsafe(`SELECT nextval('ticket_ref_${year}_seq') AS nextval`);
  });
  return `TK-${year}-${String(nextval).padStart(6, '0')}`;
}

export async function runIngestWorker() {
  await couch.db.get(DB_NAME).catch(() => couch.db.create(DB_NAME));
  const since = (await loadCheckpoint()) ?? '0';
  console.log(`[ingest] démarrage depuis seq=${since}`);

  const feed = db.changesReader.start({ since, includeDocs: true, wait: true, batchSize: 25 });

  feed.on('batch', async (batch: ChangeRow[]) => {
    for (const row of batch) {
      if (!row.id.startsWith('ticket:')) continue;
      try {
        const outcome = await ingestTicketDoc(row);
        if (outcome === 'REJECTED') console.warn(`[ingest] REJECTED ${row.id}`);
      } catch (err) {
        // erreur transitoire (DB, réseau) : on NE checkpointe pas au-delà, le flux rejouera
        console.error(`[ingest] échec ${row.id}`, err);
        feed.pause();
        setTimeout(() => feed.resume(), 5000);
        return;
      }
    }
    await saveCheckpoint(batch[batch.length - 1]!.seq);
  });

  feed.on('error', (e: unknown) => console.error('[ingest] flux _changes en erreur', e));
}

if (require.main === module) {
  runIngestWorker().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
