'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endpoints, type UserRow } from '@/lib/api';
import { currentSession } from '@/lib/auth';
import { ROLE_LABEL, ROLES, datetime } from '@/lib/format';

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function EquipePage() {
  const qc = useQueryClient();
  const me = currentSession();
  const isAdmin = me?.role === 'ADMIN';
  const assignableRoles = useMemo(() => ROLES.filter((r) => r !== 'ADMIN' || isAdmin), [isAdmin]);

  const { data, isLoading } = useQuery({ queryKey: ['users', 'all'], queryFn: () => endpoints.usersAll() });

  const [f, setF] = useState({ fullName: '', email: '', role: 'FIELD_MANAGER', phone: '', password: genPassword() });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPwd, setNewPwd] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });

  const create = useMutation({
    mutationFn: () =>
      endpoints.createUser({ fullName: f.fullName.trim(), email: f.email.trim(), role: f.role, phone: f.phone || undefined, password: f.password }),
    onSuccess: () => {
      invalidate();
      setF({ fullName: '', email: '', role: 'FIELD_MANAGER', phone: '', password: genPassword() });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => endpoints.updateUser(id, body),
    onSuccess: () => { invalidate(); setResetFor(null); setNewPwd(''); },
  });

  const valid = f.fullName.trim().length >= 2 && /.+@.+\..+/.test(f.email) && f.password.length >= 8;

  return (
    <>
      <div className="shell-head">
        <h1>Équipe & accès</h1>
        <span className="muted">{data?.data.length ?? 0} comptes</span>
      </div>

      {/* création */}
      <form
        className="card"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, alignItems: 'end' }}
        onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate(); }}
      >
        <label className="fld"><span>Nom complet</span><input value={f.fullName} onChange={(e) => set('fullName', e.target.value)} required /></label>
        <label className="fld"><span>Email (identifiant)</span><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required /></label>
        <label className="fld"><span>Téléphone</span><input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+221 77 …" /></label>
        <label className="fld">
          <span>Rôle</span>
          <select value={f.role} onChange={(e) => set('role', e.target.value)}>
            {assignableRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
        <label className="fld">
          <span>Mot de passe initial</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <input value={f.password} onChange={(e) => set('password', e.target.value)} minLength={8} required style={{ flex: 1 }} />
            <button type="button" className="btn btn-ghost" onClick={() => set('password', genPassword())}>↻</button>
          </span>
        </label>
        <button className="btn" disabled={!valid || create.isPending}>{create.isPending ? '…' : 'Créer le compte'}</button>
        {create.isError && <p style={{ color: 'var(--tone-critical)', gridColumn: '1/-1', margin: 0 }}>{(create.error as Error).message}</p>}
        <p className="muted" style={{ gridColumn: '1/-1', margin: 0 }}>
          Communiquez ce mot de passe à la personne ; elle pourra le changer ensuite.
          {!isAdmin && ' (Un responsable parc ne peut pas créer d’administrateur.)'}
        </p>
      </form>

      {/* liste */}
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>Rôle</th><th>État</th><th>Créé</th><th></th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="muted">Chargement…</td></tr>}
            {data?.data.map((u: UserRow) => {
              const self = u.id === me?.id;
              return (
                <tr key={u.id} style={{ opacity: u.active === false ? 0.5 : 1 }}>
                  <td>{u.fullName}{self && <span className="muted"> (vous)</span>}</td>
                  <td className="muted">{u.email}</td>
                  <td className="muted">{u.phone || '—'}</td>
                  <td>
                    <select
                      value={u.role}
                      disabled={self}
                      onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value } })}
                    >
                      {ROLES.filter((r) => r !== 'ADMIN' || isAdmin || u.role === 'ADMIN').map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {u.active === false
                      ? <span className="badge tone-muted">Désactivé</span>
                      : <span className="badge tone-good">Actif</span>}
                  </td>
                  <td className="muted">{datetime(u.createdAt ?? null)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {resetFor === u.id ? (
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <input
                          style={{ width: 130, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)' }}
                          placeholder="nouveau mdp (8+)"
                          value={newPwd}
                          onChange={(e) => setNewPwd(e.target.value)}
                        />
                        <button className="btn" disabled={newPwd.length < 8 || update.isPending} onClick={() => update.mutate({ id: u.id, body: { password: newPwd } })}>OK</button>
                        <button className="btn btn-ghost" onClick={() => { setResetFor(null); setNewPwd(''); }}>✕</button>
                      </span>
                    ) : (
                      <>
                        <button className="btn btn-ghost" onClick={() => { setResetFor(u.id); setNewPwd(genPassword()); }}>Mot de passe</button>
                        {!self && (
                          <button
                            className="btn btn-ghost"
                            style={{ marginLeft: 6 }}
                            onClick={() => update.mutate({ id: u.id, body: { active: !(u.active !== false) } })}
                          >
                            {u.active === false ? 'Réactiver' : 'Désactiver'}
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {update.isError && <p style={{ color: 'var(--tone-critical)' }}>{(update.error as Error).message}</p>}

      <style jsx>{`
        .fld { display: flex; flex-direction: column; gap: 5px; }
        .fld > span { font-size: 12px; font-weight: 700; color: var(--muted); }
        .fld input, .fld select { padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; }
        td select { padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--text); }
      `}</style>
    </>
  );
}
