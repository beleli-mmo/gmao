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

let session: { username: string; token: string; role?: string } | null = null;
export function setSession(s: { username: string; token: string; role?: string } | null) {
  session = s;
}
export const sessionRole = () => session?.role ?? null;
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
    if (r.status === 403) {
      return { ok: false, error: "Votre compte n'a pas le droit d'ouvrir une demande. Contactez l'administrateur." };
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
  siteName?: string;
  assetTag?: string;
  assetName?: string;
  lotCode?: string;
  lotName?: string;
  photoCount?: number;
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

/** Récupère les photos d'une DI (proxy serveur) sous forme de fichiers, pour le partage. */
export async function fetchTicketPhotos(reference: string): Promise<File[]> {
  if (!navigator.onLine || !session) return [];
  try {
    const r = await fetch(`${API}/api/sync/tickets/${encodeURIComponent(reference)}/photos`, { headers: auth() });
    if (!r.ok) return [];
    const { photos } = await r.json();
    return (photos ?? []).map((p: { name: string; mimeType: string; dataBase64: string }) => {
      const bin = atob(p.dataBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new File([bytes], p.name, { type: p.mimeType || 'image/jpeg' });
    });
  } catch {
    return [];
  }
}

// ── approvisionnement ──────────────────────────────────────────────
export interface SupplyRow {
  id: string;
  reference: string;
  status: 'DEMANDEE' | 'A_MODIFIER' | 'VALIDEE' | 'RECUE' | 'CLOTUREE' | 'ANNULEE';
  title: string;
  createdAt: string;
  purchaseOrderRef: string | null;
  site?: { name: string };
  requester?: { fullName: string };
  _count?: { items: number };
}
export interface SupplyDetail extends SupplyRow {
  note: string | null;
  needBy: string | null;
  items: { id: string; label: string; quantity: number; unit: string }[];
  events: { id: string; toStatus: string; note: string | null; createdAt: string; actor: { fullName: string } | null }[];
}

export async function listSupply(): Promise<SupplyRow[]> {
  if (!navigator.onLine || !session) return [];
  try {
    const r = await fetch(`${API}/api/supply`, { headers: auth() });
    if (r.status === 401) { authExpired(); return []; }
    if (!r.ok) return [];
    return (await r.json()).data ?? [];
  } catch {
    return [];
  }
}

export async function getSupply(id: string): Promise<SupplyDetail | null> {
  if (!navigator.onLine || !session) return null;
  try {
    const r = await fetch(`${API}/api/supply/${id}`, { headers: auth() });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Contrôle terrain : 1 à 3 photos (base64) + note → clôture la demande. */
export async function submitSupplyControl(
  id: string,
  payload: { note?: string; photos: { mimeType: string; dataBase64: string }[] },
): Promise<{ ok: boolean; error?: string }> {
  if (!navigator.onLine) return { ok: false, error: 'Pas de connexion Internet' };
  try {
    const r = await fetch(`${API}/api/supply/${id}/control`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify(payload),
    });
    if (r.status === 401) { authExpired(); return { ok: false, error: 'Session expirée — reconnectez-vous' }; }
    if (r.status === 403) return { ok: false, error: "Votre compte n'a pas le droit de contrôler." };
    if (!r.ok) {
      const b = await r.json().catch(() => null);
      return { ok: false, error: b?.message ?? `Le serveur a refusé (${r.status})` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Échec réseau — réessayez' };
  }
}
