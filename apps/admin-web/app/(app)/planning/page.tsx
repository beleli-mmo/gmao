'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { UrgencyBadge } from '@/components/StatusBadge';
import { date, datetime } from '@/lib/format';

const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

interface Assign { kind: 'MECHANIC' | 'PROVIDER'; who: string; when: string }
const emptyAssign = (): Assign => {
  const d = new Date();
  d.setHours(8, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return { kind: 'MECHANIC', who: '', when: toLocalInput(d) };
};

export default function PlanningPage() {
  const qc = useQueryClient();
  const [mechFilter, setMechFilter] = useState('');
  const [horizon, setHorizon] = useState(14);

  const mechanics = useQuery({ queryKey: ['users', 'MECHANIC'], queryFn: () => endpoints.usersList('MECHANIC') });
  const providers = useQuery({ queryKey: ['providers'], queryFn: () => endpoints.providersList() });
  const toPlan = useQuery({ queryKey: ['tickets', 'QUALIFIE'], queryFn: () => endpoints.ticketsList('?status=QUALIFIE&take=50') });
  const planned = useQuery({
    queryKey: ['interventions', 'planned', horizon, mechFilter],
    queryFn: () =>
      endpoints.interventions(`?scheduled=1&horizonDays=${horizon}${mechFilter ? `&mechanicId=${mechFilter}` : ''}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['interventions'] });
    qc.invalidateQueries({ queryKey: ['tickets'] });
    qc.invalidateQueries({ queryKey: ['overview'] });
  };

  // ── formulaires locaux ──
  const [plans, setPlans] = useState<Record<string, Assign>>({});
  const getPlan = (id: string) => plans[id] ?? emptyAssign();
  const setPlan = (id: string, patch: Partial<Assign>) =>
    setPlans((p) => ({ ...p, [id]: { ...getPlan(id), ...patch } }));

  const schedule = useMutation({
    mutationFn: ({ ticketId, a }: { ticketId: string; a: Assign }) =>
      endpoints.plan(ticketId, {
        assigneeKind: a.kind,
        mechanicId: a.kind === 'MECHANIC' ? a.who : undefined,
        providerId: a.kind === 'PROVIDER' ? a.who : undefined,
        scheduledFor: new Date(a.when).toISOString(),
      }),
    onSuccess: (_r, v) => { invalidate(); setPlans((p) => { const n = { ...p }; delete n[v.ticketId]; return n; }); },
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<Assign>(emptyAssign());
  const reschedule = useMutation({
    mutationFn: ({ id, a }: { id: string; a: Assign }) =>
      endpoints.rescheduleIntervention(id, {
        assigneeKind: a.kind,
        mechanicId: a.kind === 'MECHANIC' ? a.who || undefined : undefined,
        providerId: a.kind === 'PROVIDER' ? a.who || undefined : undefined,
        scheduledFor: new Date(a.when).toISOString(),
      }),
    onSuccess: () => { invalidate(); setEditing(null); },
  });

  const byDay = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const iv of planned.data?.data ?? []) {
      if (!iv.scheduledFor) continue;
      const k = new Date(iv.scheduledFor).toISOString().slice(0, 10);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(iv);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [planned.data]);

  const assignOptions = (kind: 'MECHANIC' | 'PROVIDER') =>
    kind === 'MECHANIC'
      ? (mechanics.data?.data ?? []).map((m) => ({ v: m.id, l: m.fullName }))
      : (providers.data?.data ?? []).map((p) => ({ v: p.id, l: p.name }));

  return (
    <>
      <div className="shell-head">
        <h1>Planning des interventions</h1>
      </div>

      <div className="toolbar">
        <select value={mechFilter} onChange={(e) => setMechFilter(e.target.value)}>
          <option value="">Tous les mécaniciens</option>
          {mechanics.data?.data.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
        </select>
        <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
          {[7, 14, 30, 60].map((d) => <option key={d} value={d}>{d} jours</option>)}
        </select>
      </div>

      {/* À PLANIFIER */}
      <div className="card">
        <h2>À planifier — tickets qualifiés ({toPlan.data?.data.length ?? 0})</h2>
        {toPlan.isLoading && <p className="muted">Chargement…</p>}
        {toPlan.data && !toPlan.data.data.length && <p className="muted">Rien à planifier. 👍</p>}
        {toPlan.data?.data.map((t) => {
          const a = getPlan(t.id);
          const opts = assignOptions(a.kind);
          return (
            <div key={t.id} className="planrow">
              <div className="planrow-info">
                <Link href={`/tickets/${t.id}`}>{t.reference}</Link> · {t.title}
                <div className="muted">{t.site.name}{t.equipment ? ` · ${t.equipment.name}` : ''}</div>
              </div>
              <UrgencyBadge urgency={t.urgency} />
              <select value={a.kind} onChange={(e) => setPlan(t.id, { kind: e.target.value as any, who: '' })}>
                <option value="MECHANIC">Interne</option>
                <option value="PROVIDER">Prestataire</option>
              </select>
              <select value={a.who} onChange={(e) => setPlan(t.id, { who: e.target.value })}>
                <option value="">— {a.kind === 'MECHANIC' ? 'mécanicien' : 'prestataire'} —</option>
                {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
              <input type="datetime-local" value={a.when} onChange={(e) => setPlan(t.id, { when: e.target.value })} />
              <button
                className="btn"
                disabled={!a.who || schedule.isPending}
                onClick={() => schedule.mutate({ ticketId: t.id, a })}
              >
                Planifier
              </button>
            </div>
          );
        })}
        {schedule.isError && <p style={{ color: 'var(--tone-critical)' }}>{(schedule.error as Error).message}</p>}
      </div>

      {/* PLANNING */}
      {planned.isLoading && <p className="muted">Chargement…</p>}
      {!planned.isLoading && !byDay.length && <p className="muted">Aucune intervention planifiée sur la période.</p>}

      {byDay.map(([day, list]) => (
        <div className="card" key={day}>
          <h2>{date(day)}</h2>
          <table>
            <thead><tr><th>Heure</th><th>Ticket</th><th>Chantier / engin</th><th>Affecté à</th><th></th></tr></thead>
            <tbody>
              {list.map((iv: any) => (
                <tr key={iv.id}>
                  <td>{datetime(iv.scheduledFor).split(' ').slice(-1)}</td>
                  <td><Link href={`/tickets/${iv.ticket?.id ?? iv.ticketId}`}>{iv.ticket?.reference ?? '—'}</Link></td>
                  <td className="muted">{iv.ticket?.site?.name}{iv.ticket?.equipment?.name ? ` · ${iv.ticket.equipment.name}` : ''}</td>
                  <td>{iv.mechanic?.fullName ?? iv.provider?.name ?? iv.assigneeKind}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {editing === iv.id ? (
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as any, who: '' })}>
                          <option value="MECHANIC">Interne</option>
                          <option value="PROVIDER">Prestataire</option>
                        </select>
                        <select value={edit.who} onChange={(e) => setEdit({ ...edit, who: e.target.value })}>
                          <option value="">— inchangé —</option>
                          {assignOptions(edit.kind).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                        <input type="datetime-local" value={edit.when} onChange={(e) => setEdit({ ...edit, when: e.target.value })} />
                        <button className="btn" disabled={reschedule.isPending} onClick={() => reschedule.mutate({ id: iv.id, a: edit })}>OK</button>
                        <button className="btn btn-ghost" onClick={() => setEditing(null)}>✕</button>
                      </span>
                    ) : (
                      <button
                        className="btn btn-ghost"
                        onClick={() => {
                          setEditing(iv.id);
                          setEdit({
                            kind: iv.assigneeKind,
                            who: iv.mechanic?.id ?? iv.provider?.id ?? '',
                            when: toLocalInput(new Date(iv.scheduledFor)),
                          });
                        }}
                      >
                        Replanifier
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {reschedule.isError && <p style={{ color: 'var(--tone-critical)' }}>{(reschedule.error as Error).message}</p>}

      <style jsx>{`
        .planrow {
          display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
          padding: 10px 0; border-bottom: 1px solid var(--line);
        }
        .planrow:last-child { border-bottom: 0; }
        .planrow-info { flex: 1 1 220px; min-width: 200px; }
        .planrow select, .planrow input {
          padding: 7px 9px; border: 1px solid var(--line); border-radius: 7px;
          background: var(--surface); color: var(--text); font: inherit;
        }
        td select, td input { padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--text); }
      `}</style>
    </>
  );
}
