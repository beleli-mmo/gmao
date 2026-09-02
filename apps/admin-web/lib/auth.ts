'use client';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface Session {
  id: string;
  role: 'FIELD_MANAGER' | 'PARK_MANAGER' | 'MECHANIC' | 'ADMIN';
  fullName: string;
}

export async function login(email: string, password: string): Promise<Session> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Identifiants invalides');
  const data = (await res.json()) as { accessToken: string; refreshToken: string; user: Session };
  localStorage.setItem('gmao.accessToken', data.accessToken);
  localStorage.setItem('gmao.refreshToken', data.refreshToken);
  localStorage.setItem('gmao.user', JSON.stringify(data.user));
  return data.user;
}

export function logout() {
  ['accessToken', 'refreshToken', 'user'].forEach((k) => localStorage.removeItem(`gmao.${k}`));
  location.href = '/login';
}

export function currentSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('gmao.user');
  return raw ? (JSON.parse(raw) as Session) : null;
}
