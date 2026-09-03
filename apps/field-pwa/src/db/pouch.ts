import PouchDB from 'pouchdb-browser';

/**
 * Modèle simplifié : **pas de file d'attente hors ligne**.
 *  - `gmao_ref`     : référentiel (projets / actifs / lots / pièces), mis en cache pour l'affichage
 *  - `gmao_tickets` : ARCHIVE locale des DI déjà envoyées (consultable dans « Mes demandes »)
 * Sans connexion → on ne crée pas de DI. Avec connexion → envoi immédiat + accusé + archivage.
 */
export const localRef = new PouchDB('gmao_ref');
export const localTickets = new PouchDB('gmao_tickets');

const API = (import.meta.env.VITE_API_URL as string)?.replace(/\/$/, '') || '';

let session: { username: string; token: string } | null = null;
export function setSession(s: { username: string; token: string } | null) {
  session = s;
}
export const isOnline = () => navigator.onLine;
function auth(): HeadersInit {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.token ?? ''}` };
}

let authExpiredCb: () => void = () => {};
export function onAuthExpiredCallback(cb: () => void) {
  authExpiredCb = cb;
}
function authExpired() {
  session = null;
  localStorage.removeItem('gmao.session');
  authExpiredCb();
}

// ── référentiel descendant (dropdowns) ──────────────────────────────
export async function pullReference(): Promise<void> {
  if (!navigator.onLine) return;
  const r = await fetch(`${API}/api/sync/reference`, { headers: auth() });
  if (r.status === 401) return authExpired();
  if (!r.ok) throw new Error(`reference ${r.status}`);
  const data = await r.json();
  const docs: any[] = [
    ...data.sites.map((s: any) => ({ _id: `site:${s.id}`, type: 'site', ...s })),
    ...data.lots.map((l: any) => ({ _id: `lot:${l.id}`, type: 'lot', ...l })),
    ...data.parts.map((p: any) => ({ _id: `part:${p.id}`, type: 'part', ...p })),
    ...data.equipment.map((e: any) => ({ _id: `equipment:${e.id}`, type: 'equipment', ...e })),
  ];
  const existing = await localRef.allDocs();
  const revs = new Map(existing.rows.map((row) => [row.id, row.value.rev]));
  await localRef.bulkDocs(docs.map((d) => (revs.has(d._id) ? { ...d, _rev: revs.get(d._id) } : d)));
}

// ── envoi INSTANTANÉ d'une DI ───────────────────────────────────────
export interface SubmitResult {
  ok: boolean;
  reference?: string;
  error?: string;
}

export async function submitTicket(payload: any): Promise<SubmitResult> {
  if (!navigator.onLine) return { ok: false, error: 'Pas de connexion Internet' };
  try {
    const r = await fetch(`${API}/api/sync/tickets`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ tickets: [payload] }),
    });
    if (r.status === 401) {
      authExpired();
      return { ok: false, error: 'Session expirée — reconnectez-vous' };
    }
    if (!r.ok) return { ok: false, error: `Le serveur a refusé la demande (${r.status})` };
    const { results } = await r.json();
    const res = results?.[0];
    if (!res || res.status === 'error' || !res.reference) {
      return { ok: false, error: res?.error ? `Serveur : ${res.error}` : 'La demande n’a pas pu être enregistrée' };
    }
    if (res.status !== 'created' && res.status !== 'exists') {
      return { ok: false, error: 'Réponse inattendue du serveur' };
    }
    // archive locale (sans les binaires)
    const { media, fieldSignature, ...meta } = payload;
    void media; void fieldSignature;
    await localTickets.put({
      _id: `ticket:${payload.clientId}`,
      type: 'ticket',
      reference: res.reference,
      status: 'ENVOYEE',
      sentAt: new Date().toISOString(),
      ...meta,
    });
    return { ok: true, reference: res.reference };
  } catch {
    return { ok: false, error: 'Échec réseau — vérifiez votre connexion et réessayez' };
  }
}

// ── historique du technicien (archive locale + statut serveur) ──────
export interface MyTicket {
  reference: string;
  title: string;
  type: string;
  urgency: string;
  status: string;
  createdAtField: string;
  siteCode?: string;
  assetTag?: string;
  lotCode?: string;
  fromServer: boolean;
}

export async function listMyTickets(): Promise<MyTicket[]> {
  const byRef = new Map<string, MyTicket>();

  const local = (
    await localTickets.allDocs({ include_docs: true, startkey: 'ticket:', endkey: 'ticket:￿' })
  ).rows
    .map((r) => r.doc as any)
    .filter((d) => d && d.reference);
  for (const l of local) {
    byRef.set(l.reference, {
      reference: l.reference,
      title: l.title,
      type: l.type,
      urgency: l.urgency,
      status: l.status || 'ENVOYEE',
      createdAtField: l.createdAtField,
      fromServer: false,
    });
  }

  if (navigator.onLine && session) {
    try {
      const r = await fetch(`${API}/api/sync/my-tickets`, { headers: auth() });
      if (r.status === 401) authExpired();
      else if (r.ok) {
        for (const s of (await r.json()).data ?? []) {
          byRef.set(s.reference, { ...byRef.get(s.reference), ...s, fromServer: true });
        }
      }
    } catch {
      /* hors ligne / erreur réseau : on garde l'archive locale */
    }
  }

  return [...byRef.values()].sort((a, b) => (b.createdAtField || '').localeCompare(a.createdAtField || ''));
}
