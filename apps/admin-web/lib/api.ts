'use client';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API ${status}`);
  }
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('gmao.accessToken');
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('gmao.accessToken');
    if (!location.pathname.startsWith('/login')) location.href = '/login';
  }
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, data?: unknown) => request<T>(p, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  patch: <T>(p: string, data?: unknown) => request<T>(p, { method: 'PATCH', body: JSON.stringify(data ?? {}) }),
};

// ── types de lecture (miroir partiel de Prisma) ──────────────────────
export type TicketStatus =
  | 'CREE' | 'EN_ATTENTE' | 'QUALIFIE' | 'PLANIFIE' | 'EN_COURS'
  | 'TRAVAUX_TERMINES' | 'VALIDE_TERRAIN' | 'CLOTURE' | 'ANNULE';
export type Urgency = 'N1_BLOQUANT' | 'N2_MAJEUR' | 'N3_MINEUR';
export type EquipmentStatus = 'EN_SERVICE' | 'EN_PANNE' | 'EN_MAINTENANCE' | 'EN_TRANSIT' | 'REFORME';
export type CostKind = 'MAIN_OEUVRE' | 'PIECE' | 'FACTURE_EXTERNE' | 'DEPLACEMENT';

export interface TicketListItem {
  id: string;
  reference: string;
  type: string;
  urgency: Urgency;
  status: TicketStatus;
  title: string;
  createdAt: string;
  createdAtField: string;
  dueDate?: string | null;
  site: { code: string; name: string };
  equipment: { assetTag: string; name: string } | null;
  lot: { code: string; name: string; color: string } | null;
  _count: { attachments: number; costLines: number };
}

export interface TicketDetail extends TicketListItem {
  description?: string;
  reporter: { id: string; fullName: string };
  meterAtReport?: number;
  events: { id: string; fromStatus: string | null; toStatus: string; createdAt: string; note?: string; actor?: { fullName: string } }[];
  attachments: { id: string; kind: string; storageKey: string; mimeType: string }[];
  signature: { signerName: string; signedAt: string } | null;
  interventions: {
    id: string; assigneeKind: 'MECHANIC' | 'PROVIDER'; scheduledFor?: string;
    laborHours?: number; laborRate?: number; travelKm?: number;
    mechanic?: { fullName: string }; provider?: { name: string };
  }[];
  requestedParts: { id: string; qtyRequested: number; qtyConsumed: number; unitCost: number; part: { sku: string; label: string } }[];
  costLines: { id: string; kind: CostKind; label: string; quantity: number; unitAmount: number; amount: number; locked: boolean }[];
  totalCost: number;
}

export interface Equipment {
  id: string; assetTag: string; name: string; kind: string;
  brand?: string; model?: string; status: EquipmentStatus;
  meterKind: 'HEURES' | 'KM' | 'NONE'; currentMeter: number;
  zone?: string | null; criticality?: string;
  lot?: { code: string; name: string; color: string } | null;
  site?: { code: string; name: string } | null;
}

export interface LotRow {
  id: string; code: string; name: string; defaultFrequency?: string | null;
  isRegulatory: boolean; color: string;
  _count: { equipment: number; tickets: number };
}

export interface SiteRow {
  id: string; code: string; name: string; address?: string; active: boolean;
  _count: { tickets: number; assignments: number };
}
export interface UserRow {
  id: string; fullName: string; role: string;
  email?: string; phone?: string | null; active?: boolean; createdAt?: string;
}

export interface EquipmentDetail extends Equipment {
  serialNumber?: string; year?: number; acquisitionCost?: number | null; acquisitionDate?: string | null;
  currentSite: { code: string; name: string } | null;
  lifetimeCost: number;
  openTickets: number;
  preventivePlans: { id: string; label: string; trigger: string; nextDueDate?: string | null; nextDueMeter?: number | null; isRegulatory: boolean }[];
  meterReadings: { id: string; value: number; kind: string; readAt: string; source: string }[];
  tickets: {
    id: string; reference: string; type: string; urgency: Urgency; status: TicketStatus;
    title: string; createdAtField: string; closedAt?: string | null; dueDate?: string | null; cost: number;
    intervention: { assigneeKind: string; laborHours?: number; endedAt?: string | null; mechanic?: { fullName: string }; provider?: { name: string } } | null;
  }[];
}

export const endpoints = {
  ticketsList: (qs = '') => api.get<{ data: TicketListItem[]; nextCursor: string | null }>(`/api/tickets${qs}`),
  ticket: (id: string) => api.get<TicketDetail>(`/api/tickets/${id}`),
  createTicket: (body: unknown) => api.post<{ id: string; reference: string }>('/api/tickets', body),
  qualify: (id: string, body: unknown) => api.post(`/api/tickets/${id}/qualify`, body),
  plan: (id: string, body: unknown) => api.post(`/api/tickets/${id}/plan`, body),
  start: (id: string) => api.post(`/api/tickets/${id}/start`),
  workDone: (id: string, body: unknown) => api.post(`/api/tickets/${id}/work-done`, body),
  validate: (id: string, body: unknown) => api.post(`/api/tickets/${id}/validate`, body),
  close: (id: string, body: unknown) => api.post(`/api/tickets/${id}/close`, body),
  addExternalInvoice: (id: string, body: unknown) => api.post(`/api/tickets/${id}/external-invoice`, body),

  equipmentList: (qs = '') => api.get<{ data: Equipment[] }>(`/api/equipment${qs}`),
  equipment: (id: string) => api.get<EquipmentDetail>(`/api/equipment/${id}`),
  createEquipment: (body: unknown) => api.post('/api/equipment', body),
  equipmentStatus: (id: string, status: EquipmentStatus) => api.patch(`/api/equipment/${id}/status`, { status }),

  lotsList: () => api.get<{ data: LotRow[] }>('/api/lots'),
  createLot: (body: unknown) => api.post('/api/lots', body),

  sitesList: (qs = '') => api.get<{ data: SiteRow[] }>(`/api/sites${qs}`),
  createSite: (body: unknown) => api.post('/api/sites', body),

  usersList: (role?: string) => api.get<{ data: UserRow[] }>(`/api/users${role ? `?role=${role}` : ''}`),
  usersAll: () => api.get<{ data: UserRow[] }>('/api/users?all=true'),
  createUser: (body: unknown) => api.post<UserRow>('/api/users', body),
  updateUser: (id: string, body: unknown) => api.patch<UserRow>(`/api/users/${id}`, body),

  parts: (belowReorder = false) =>
    api.get<{ data: any[] }>(`/api/stock/parts${belowReorder ? '?belowReorder=true' : ''}`),
  createPart: (body: unknown) => api.post('/api/stock/parts', body),
  receiveStock: (id: string, body: unknown) => api.post(`/api/stock/parts/${id}/receive`, body),

  overview: () => api.get<Overview>('/api/analytics/overview'),
  costBySite: (from: string, to: string) =>
    api.get<{ rows: { site_code: string; site_name: string; kind: CostKind; total: number; ticket_count: number }[] }>(
      `/api/analytics/cost-by-site?from=${from}&to=${to}`,
    ),
  costByLot: (from: string, to: string) =>
    api.get<{ rows: { lot_code: string; lot_name: string; color: string; kind: CostKind; total: number; ticket_count: number }[] }>(
      `/api/analytics/cost-by-lot?from=${from}&to=${to}`,
    ),
  trpp: (from: string, to: string) =>
    api.get<{
      total: number; respected: number; overdue: number; pct: number;
      byLot: { lot_code: string; lot_name: string; total: number; respected: number; pct: number }[];
    }>(`/api/analytics/trpp?from=${from}&to=${to}`),
  reliability: (from: string, to: string) =>
    api.get<{ rows: any[] }>(`/api/analytics/reliability?from=${from}&to=${to}`),
  tco: () => api.get<{ rows: any[] }>('/api/analytics/tco'),
  interventions: (qs = '') => api.get<{ data: any[] }>(`/api/interventions${qs}`),
  rescheduleIntervention: (id: string, body: unknown) => api.patch(`/api/interventions/${id}`, body),

  providersList: () => api.get<{ data: { id: string; name: string }[] }>('/api/providers'),
};

export interface Overview {
  openTickets: number;
  blockingTickets: number;
  ticketsByStatus: { status: TicketStatus; count: number }[];
  equipmentByStatus: { status: EquipmentStatus; count: number }[];
  fleetUnavailabilityPct: number;
  partsBelowReorder: number;
  monthMaintenanceCost: number;
  trppPct: number;
  trppOverdue: number;
  trppTarget: number;
}
