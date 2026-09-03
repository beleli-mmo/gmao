import PouchDB from 'pouchdb-browser';

/**
 * Stockage local hors‑ligne (IndexedDB via PouchDB) + synchronisation REST avec l'API.
 *  - `gmao_tickets` : DI créées sur le terrain, poussées vers `POST /api/sync/tickets`
 *  - `gmao_ref`     : référentiel descendant (projets, actifs, lots, pièces) tiré de `GET /api/sync/reference`
 *  - `gmao_meta`    : purement local (préférences, brouillons)
 */
export const localTickets = new PouchDB('gmao_tickets');
export const localRef = new PouchDB('gmao_ref');
export const localMeta = new PouchDB('gmao_meta');

const API = (import.meta.env.VITE_API_URL as string)?.replace(/\/$/, '') || '';
const PULL_MS = 60_000;
const PUSH_MS = 15_000;

export interface SyncSnapshot {
  state: 'idle' | 'active' | 'paused' | 'error' | 'offline';
  pending: number;
  lastError?: string;
  lastSyncAt?: number;
}
let snapshot: SyncSnapshot = { state: 'offline', pending: 0 };
const listeners = new Set<(s: SyncSnapshot) => void>();
export function onSync(fn: (s: SyncSnapshot) => void) {
  listeners.add(fn);
  fn(snapshot);
  return () => {
    listeners.delete(fn);
  };
}
function emit(patch: Partial<SyncSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l(snapshot));
}

let session: { username: string; token: string } | null = null;
let pullTimer: ReturnType<typeof setInterval> | null = null;
let pushTimer: ReturnType<typeof setInterval> | null = null;
let running = false;

function authHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.token ?? ''}` };
}

async function countPending(): Promise<number> {
  const res = await localTickets.allDocs({ include_docs: true, startkey: 'ticket:', endkey: 'ticket:￿' });
  return res.rows.filter((r) => (r.doc as any)?.syncState?.pushed === false).length;
}

// ── PULL : référentiel descendant ────────────────────────────────────
export async function pullReference(): Promise<void> {
  const r = await fetch(`${API}/api/sync/reference`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`reference ${r.status}`);
  const data = await r.json();

  const docs: any[] = [
    ...data.sites.map((s: any) => ({ _id: `site:${s.id}`, type: 'site', ...s })),
    ...data.lots.map((l: any) => ({ _id: `lot:${l.id}`, type: 'lot', ...l })),
    ...data.parts.map((p: any) => ({ _id: `part:${p.id}`, type: 'part', ...p })),
    ...data.equipment.map((e: any) => ({ _id: `equipment:${e.id}`, type: 'equipment', ...e })),
  ];
  // upsert : on récupère les _rev existants pour écraser proprement
  const existing = await localRef.allDocs();
  const revs = new Map(existing.rows.map((row) => [row.id, row.value.rev]));
  await localRef.bulkDocs(docs.map((d) => (revs.has(d._id) ? { ...d, _rev: revs.get(d._id) } : d)));
}

// ── PUSH : remontée des DI terrain ──────────────────────────────────
export async function pushTickets(): Promise<void> {
  const all = await localTickets.allDocs({ include_docs: true, attachments: true, binary: false, startkey: 'ticket:', endkey: 'ticket:￿' });
  const queued = all.rows.map((r) => r.doc as any).filter((d) => d && d.syncState?.pushed === false);
  if (!queued.length) return;

  const payload = queued.map((d) => {
    const atts = d._attachments ?? {};
    const media = (d.media ?? [])
      .filter((m: any) => atts[m.attName])
      .map((m: any) => ({ kind: m.kind, mimeType: m.mimeType, dataBase64: atts[m.attName].data, capturedAt: m.capturedAt }));
    const fieldSignature = d.fieldSignature && atts[d.fieldSignature.attName]
      ? { signerName: d.fieldSignature.signerName, signedAt: d.fieldSignature.signedAt, dataBase64: atts[d.fieldSignature.attName].data }
      : null;
    return {
      clientId: d.clientId,
      type: d.ticketType,
      urgency: d.urgency,
      title: d.title,
      description: d.description,
      siteId: d.siteId,
      equipmentId: d.equipmentId ?? null,
      reporterId: d.reporterId,
      meterKind: d.meterKind ?? 'NONE',
      meterValue: d.meterValue ?? null,
      createdAtField: d.createdAtField,
      geo: d.geo ?? null,
      requestedParts: d.requestedParts ?? [],
      media,
      fieldSignature,
    };
  });

  const r = await fetch(`${API}/api/sync/tickets`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ tickets: payload }) });
  if (!r.ok) throw new Error(`push ${r.status}`);
  const { results } = await r.json();

  const byClient = new Map<string, any>(results.map((x: any) => [x.clientId, x]));
  for (const d of queued) {
    const res = byClient.get(d.clientId);
    if (res && (res.status === 'created' || res.status === 'exists')) {
      const fresh: any = await localTickets.get(d._id);
      fresh.syncState = { pushed: true, syncedAt: Date.now() };
      fresh.serverRef = res.reference || fresh.serverRef;
      await localTickets.put(fresh);
    }
  }
}

async function cycle() {
  if (!session || !navigator.onLine) {
    emit({ state: 'offline', pending: await countPending() });
    return;
  }
  try {
    emit({ state: 'active' });
    await pushTickets();
    emit({ state: 'paused', pending: await countPending(), lastSyncAt: Date.now(), lastError: undefined });
  } catch (e) {
    emit({ state: 'error', pending: await countPending(), lastError: String(e) });
  }
}

export async function startSync(s: { username: string; token: string }) {
  session = s;
  if (running) return;
  running = true;

  await pullReference().catch((e) => emit({ lastError: String(e) }));
  await cycle();

  pushTimer = setInterval(cycle, PUSH_MS);
  pullTimer = setInterval(() => pullReference().catch(() => {}), PULL_MS);
  window.addEventListener('online', cycle);
  window.addEventListener('offline', () => emit({ state: 'offline' }));
}

export function stopSync() {
  running = false;
  session = null;
  if (pushTimer) clearInterval(pushTimer);
  if (pullTimer) clearInterval(pullTimer);
  window.removeEventListener('online', cycle);
  emit({ state: 'offline' });
}
