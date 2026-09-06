'use client';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type Session = { token: string; user: { id: string; fullName: string; role: string } };

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('belel.pdg');
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
export function setSession(s: Session | null) {
  if (s) localStorage.setItem('belel.pdg', JSON.stringify(s));
  else localStorage.removeItem('belel.pdg');
}

async function get<T>(path: string): Promise<T> {
  const s = getSession();
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(s ? { Authorization: `Bearer ${s.token}` } : {}) },
  });
  if (res.status === 401 && typeof window !== 'undefined') {
    setSession(null);
    if (!location.pathname.startsWith('/login')) location.href = '/login';
  }
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(typeof body === 'object' && body ? (body.message ?? body.error ?? `API ${res.status}`) : `API ${res.status}`);
  return body as T;
}

export async function login(email: string, password: string): Promise<Session> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Identifiants invalides');
  const d = await res.json();
  return { token: d.accessToken, user: { id: d.user.id, fullName: d.user.fullName, role: d.user.role } };
}

const yearStart = () => new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

export const api = {
  overview: () => get<Overview>('/api/analytics/overview'),
  report: (period: 'week' | 'month', date: string, siteId?: string) =>
    get<ReportData>(`/api/reports?period=${period}&date=${date}${siteId ? `&siteId=${siteId}` : ''}`),
  interventions: (qs = '') => get<{ data: Iv[] }>(`/api/interventions${qs}`),
  tickets: (qs = '') => get<{ data: TicketRow[] }>(`/api/tickets${qs}`),
  sites: () => get<{ data: { id: string; name: string }[] }>('/api/sites'),
  lots: () => get<{ data: { id: string; name: string; color: string }[] }>('/api/lots'),
  costByLot: (from = yearStart(), to = today()) =>
    get<{ rows: { lot_code: string; lot_name: string; color: string; kind: string; total: number }[] }>(`/api/analytics/cost-by-lot?from=${from}&to=${to}`),
  costBySite: (from = yearStart(), to = today()) =>
    get<{ rows: { site_code: string; site_name: string; kind: string; total: number }[] }>(`/api/analytics/cost-by-site?from=${from}&to=${to}`),
  trpp: (from = yearStart(), to = today()) =>
    get<{ total: number; respected: number; overdue: number; pct: number; byLot: { lot_name: string; total: number; respected: number; pct: number }[] }>(`/api/analytics/trpp?from=${from}&to=${to}`),
  reliability: (from = yearStart(), to = today()) => get<{ rows: any[] }>(`/api/analytics/reliability?from=${from}&to=${to}`),
  tco: () => get<{ rows: any[] }>('/api/analytics/tco'),
};

// ── types ──
export interface Overview {
  openTickets: number; blockingTickets: number;
  trppPct: number; trppTarget: number; trppOverdue: number;
  fleetUnavailabilityPct: number; partsBelowReorder: number; monthMaintenanceCost: number;
  ticketsByStatus: { status: string; count: number }[];
}
export interface Iv {
  id: string; assigneeKind: string;
  scheduledFor: string | null; expectedDeliveryAt: string | null; startedAt: string | null; endedAt: string | null;
  laborHours: number | null; travelKm: number | null; report: string | null;
  mechanic: { fullName: string } | null; provider: { name: string } | null;
  ticket: { id: string; reference: string; title: string; status: string; urgency: string; site: { name: string } | null; equipment: { name: string } | null } | null;
}
export interface TicketRow {
  id: string; reference: string; title: string; type: string; urgency: string; status: string;
  createdAtField: string; closedAt: string | null;
  site: { name: string }; lot: { name: string; color: string } | null; equipment: { name: string } | null;
}
export interface Tally { key: string; count: number; color?: string; respected?: number; pct?: number }
export interface MoneyRow { key: string; total: number; color?: string }
export interface ReportData {
  meta: { period: 'week' | 'month'; label: string; from: string; to: string; generatedAt: string; scope: string };
  kpis: {
    created: number; closed: number; closureRate: number | null; p1Created: number;
    avgResolutionDays: number | null; backlogOpen: number; backlogOverdue: number;
    oldestOpen: string | null; trppPct: number; costTotal: number;
  };
  breakdowns: { byStatus: Tally[]; byUrgency: Tally[]; byType: Tally[]; byLot: Tally[]; bySite: Tally[] };
  closed: { reference: string; title: string; urgency: string; siteName: string; lotName: string; closedAt: string | null; resolutionDays: number | null; cost: number }[];
  trpp: { total: number; respected: number; overdue: number; pct: number; byLot: Tally[] };
  costs: { total: number; byKind: MoneyRow[]; byLot: MoneyRow[]; bySite: MoneyRow[] };
  actors: { name: string; kind: string; count: number; hours: number; planRespectPct: number | null }[];
  topAssets: { byCount: Tally[]; byCost: MoneyRow[] };
}
