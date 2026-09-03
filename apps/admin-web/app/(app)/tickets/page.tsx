'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { endpoints, type TicketStatus } from '@/lib/api';
import { TicketStatusBadge, UrgencyBadge } from '@/components/StatusBadge';
import { datetime, TICKET_STATUS_LABEL, TICKET_STATUS_ORDER, TICKET_TYPE_LABEL, URGENCY_LABEL } from '@/lib/format';

export default function TicketsPage() {
  const [status, setStatus] = useState<string>('');
  const [urgency, setUrgency] = useState<string>('');
  const [lotId, setLotId] = useState<string>('');

  const lots = useQuery({ queryKey: ['lots'], queryFn: () => endpoints.lotsList() });

  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (urgency) qs.set('urgency', urgency);
  qs.set('take', '100');

  const { data, isLoading, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['tickets', status, urgency],
    queryFn: () => endpoints.ticketsList(`?${qs.toString()}`),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const lotCode = lots.data?.data.find((l) => l.id === lotId)?.code;
  const rows = (data?.data ?? []).filter((t) => !lotCode || t.lot?.code === lotCode);

  return (
    <>
      <div className="shell-head">
        <h1>Demandes d’intervention</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {isFetching ? 'Actualisation…' : dataUpdatedAt ? `à jour · ${new Date(dataUpdatedAt).toLocaleTimeString('fr-FR')}` : ''}
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => refetch()} disabled={isFetching}>↻ Actualiser</button>
          <Link href="/tickets/new" className="btn">+ Nouvelle DI</Link>
        </div>
      </div>

      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {TICKET_STATUS_ORDER.concat('ANNULE').map((s) => (
            <option key={s} value={s}>{TICKET_STATUS_LABEL[s as TicketStatus]}</option>
          ))}
        </select>
        <select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
          <option value="">Toutes priorités</option>
          <option value="N1_BLOQUANT">{URGENCY_LABEL.N1_BLOQUANT}</option>
          <option value="N2_MAJEUR">{URGENCY_LABEL.N2_MAJEUR}</option>
          <option value="N3_MINEUR">{URGENCY_LABEL.N3_MINEUR}</option>
        </select>
        <select value={lotId} onChange={(e) => setLotId(e.target.value)}>
          <option value="">Tous les lots</option>
          {lots.data?.data.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Réf.</th><th>Nature</th><th>Objet</th><th>Projet</th><th>Lot</th><th>Actif</th><th>Priorité</th><th>Statut</th><th>Créée</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={9} className="muted">Chargement…</td></tr>}
            {rows.map((t) => (
              <tr key={t.id}>
                <td><Link href={`/tickets/${t.id}`}>{t.reference}</Link></td>
                <td className="muted">{TICKET_TYPE_LABEL[t.type] ?? t.type}</td>
                <td>{t.title}</td>
                <td>{t.site.code}</td>
                <td>{t.lot ? <span className="badge" style={{ background: `${t.lot.color}22`, color: t.lot.color }}>{t.lot.code}</span> : '—'}</td>
                <td>{t.equipment?.assetTag ?? '—'}</td>
                <td><UrgencyBadge urgency={t.urgency} /></td>
                <td><TicketStatusBadge status={t.status} /></td>
                <td className="muted">{datetime(t.createdAtField)}</td>
              </tr>
            ))}
            {data && !rows.length && <tr><td colSpan={9} className="muted">Aucune demande.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
