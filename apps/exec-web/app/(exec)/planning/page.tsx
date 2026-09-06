'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Iv } from '@/lib/api';
import { date, datetime } from '@/lib/format';

const who = (iv: Iv) => iv.mechanic?.fullName ?? iv.provider?.name ?? (iv.assigneeKind === 'PROVIDER' ? 'Prestataire' : 'Interne');

export default function PlanningPage() {
  const [horizon, setHorizon] = useState(14);
  const { data, isLoading } = useQuery({
    queryKey: ['planning', horizon],
    queryFn: () => api.interventions(`?scheduled=1&horizonDays=${horizon}`),
  });

  const byDay = useMemo(() => {
    const m = new Map<string, Iv[]>();
    for (const iv of data?.data ?? []) {
      if (!iv.scheduledFor) continue;
      const k = new Date(iv.scheduledFor).toISOString().slice(0, 10);
      (m.get(k) ?? m.set(k, []).get(k)!).push(iv);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  return (
    <>
      <div className="page-h">
        <div>
          <h1>Planning</h1>
          <div className="sub">Interventions programmées</div>
        </div>
        <span className="readonly">Lecture seule</span>
      </div>

      <div className="toolbar">
        <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
          {[7, 14, 30, 60].map((d) => <option key={d} value={d}>{d} prochains jours</option>)}
        </select>
      </div>

      {isLoading && <p className="muted">Chargement…</p>}
      {!isLoading && !byDay.length && <p className="muted">Aucune intervention planifiée sur la période.</p>}

      {byDay.map(([day, list]) => (
        <div className="card" key={day}>
          <h2>{date(day)} — {list.length} intervention{list.length > 1 ? 's' : ''}</h2>
          <div className="scroll-x">
            <table>
              <thead><tr><th>Heure</th><th>DI</th><th>Objet</th><th>Projet / actif</th><th>Intervenant</th><th>Livraison prévue</th></tr></thead>
              <tbody>
                {list.map((iv) => (
                  <tr key={iv.id}>
                    <td>{datetime(iv.scheduledFor).split(' ').slice(-1)}</td>
                    <td>{iv.ticket?.reference ?? '—'}</td>
                    <td>{iv.ticket?.title ?? '—'}</td>
                    <td className="muted">{iv.ticket?.site?.name}{iv.ticket?.equipment?.name ? ` · ${iv.ticket.equipment.name}` : ''}</td>
                    <td>{who(iv)}</td>
                    <td className="muted">{iv.expectedDeliveryAt ? date(iv.expectedDeliveryAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
