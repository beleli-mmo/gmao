'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { datetime, SUPPLY_STATUS_LABEL, SUPPLY_STATUS_TONE } from '@/lib/format';
import { matches } from '@/lib/search';

export default function ApproPage() {
  const list = useQuery({ queryKey: ['supply'], queryFn: () => endpoints.supplyList(), refetchInterval: 20_000 });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const rows = (list.data?.data ?? [])
    .filter((s) => !status || s.status === status)
    .filter((s) => matches(q, s.reference, s.title, s.site?.name, s.requester?.fullName, s.purchaseOrderRef ?? undefined));

  return (
    <>
      <div className="shell-head">
        <h1>Approvisionnement</h1>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Demandes de matériel envoyées depuis <strong>GMAO Terrain</strong> par les chefs de chantier.
        Le directeur technique <strong>valide</strong> (bon de commande généré), le chef confirme la
        réception sur le terrain, puis le contrôleur vérifie l’installation (photos) pour clôturer.
      </p>

      <div className="toolbar">
        <input type="search" placeholder="Rechercher (réf, objet, chantier, demandeur, BC)…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260, flex: 1 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(SUPPLY_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Réf.</th><th>Objet</th><th>Chantier</th><th>Demandeur</th><th>Articles</th><th>Bon de commande</th><th>Statut</th><th>Créée</th></tr></thead>
          <tbody>
            {list.isLoading && <tr><td colSpan={8} className="muted">Chargement…</td></tr>}
            {list.data && !rows.length && <tr><td colSpan={8} className="muted">Aucune demande d’approvisionnement.</td></tr>}
            {rows.map((s) => (
              <tr key={s.id}>
                <td><Link href={`/approvisionnement/${s.id}`}>{s.reference}</Link></td>
                <td>{s.title}</td>
                <td className="muted">{s.site?.name}</td>
                <td className="muted">{s.requester?.fullName}</td>
                <td>{s._count.items}</td>
                <td className="muted">{s.purchaseOrderRef ?? '—'}</td>
                <td><span className={`badge tone-${SUPPLY_STATUS_TONE[s.status]}`}>{SUPPLY_STATUS_LABEL[s.status]}</span></td>
                <td className="muted">{datetime(s.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
