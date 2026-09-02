'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { EquipmentStatusBadge, TicketStatusBadge, UrgencyBadge } from '@/components/StatusBadge';
import { CRITICALITY_LABEL, TICKET_TYPE_LABEL, date, datetime, money } from '@/lib/format';

export default function CarnetDeSantePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: e, isLoading } = useQuery({ queryKey: ['equipment', id], queryFn: () => endpoints.equipment(id) });

  if (isLoading || !e) return <p className="muted">Chargement…</p>;

  const preventifs = e.tickets.filter((t) => t.type === 'MAINTENANCE_PREVENTIVE');
  const curatifs = e.tickets.filter((t) => t.type !== 'MAINTENANCE_PREVENTIVE');

  return (
    <>
      <div className="shell-head">
        <div>
          <button className="btn btn-ghost" onClick={() => router.push('/parc')} style={{ padding: '4px 10px', fontSize: 13 }}>← Actifs</button>
          <h1 style={{ marginTop: 8 }}>{e.assetTag}</h1>
          <p className="muted">{e.name}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {e.lot && <span className="badge" style={{ background: `${e.lot.color}22`, color: e.lot.color }}>{e.lot.code} · {e.lot.name}</span>}
          <EquipmentStatusBadge status={e.status} />
        </div>
      </div>

      <div className="grid grid-kpi" style={{ marginBottom: 18 }}>
        <div className="kpi"><span className="kpi-label">Coût de possession cumulé</span><strong className="kpi-value">{money(e.lifetimeCost)}</strong></div>
        <div className="kpi"><span className="kpi-label">DI ouvertes</span><strong className="kpi-value">{e.openTickets}</strong></div>
        <div className="kpi"><span className="kpi-label">Interventions</span><strong className="kpi-value">{e.tickets.length}</strong></div>
        <div className="kpi"><span className="kpi-label">Compteur</span><strong className="kpi-value">{e.meterKind === 'NONE' ? '—' : `${e.currentMeter} ${e.meterKind === 'HEURES' ? 'h' : 'km'}`}</strong></div>
      </div>

      <div className="grid grid-2">
        <div>
          <div className="card">
            <h2>Identification</h2>
            <table>
              <tbody>
                <tr><th>Projet / site</th><td>{e.currentSite ? `${e.currentSite.code} · ${e.currentSite.name}` : '—'}</td></tr>
                <tr><th>Zone / niveau</th><td>{e.zone ?? '—'}</td></tr>
                <tr><th>Nature</th><td>{e.kind}</td></tr>
                <tr><th>Criticité</th><td>{CRITICALITY_LABEL[e.criticality ?? 'STANDARD']}</td></tr>
                <tr><th>Marque / modèle</th><td>{[e.brand, e.model].filter(Boolean).join(' ') || '—'}</td></tr>
                <tr><th>N° série</th><td>{e.serialNumber ?? '—'}</td></tr>
                <tr><th>Acquisition</th><td>{e.acquisitionCost ? `${money(e.acquisitionCost)} · ${date(e.acquisitionDate ?? null)}` : '—'}</td></tr>
                <tr><th>QR</th><td><code>GMAO:{e.assetTag}</code></td></tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>Plan préventif</h2>
            {e.preventivePlans.length ? (
              <table>
                <thead><tr><th>Opération</th><th>Déclencheur</th><th>Prochaine échéance</th></tr></thead>
                <tbody>
                  {e.preventivePlans.map((p) => (
                    <tr key={p.id}>
                      <td>{p.label}{p.isRegulatory && <span className="badge tone-info" style={{ marginLeft: 6 }}>Réglementaire</span>}</td>
                      <td className="muted">{p.trigger}</td>
                      <td>{p.trigger === 'CALENDAIRE' ? date(p.nextDueDate ?? null) : `${p.nextDueMeter ?? '—'} ${e.meterKind === 'KM' ? 'km' : 'h'}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="muted">Aucun plan préventif défini.</p>}
          </div>

          {e.meterReadings.length > 0 && (
            <div className="card">
              <h2>Relevés compteur</h2>
              <table>
                <thead><tr><th>Date</th><th>Valeur</th><th>Source</th></tr></thead>
                <tbody>
                  {e.meterReadings.slice(0, 8).map((m) => (
                    <tr key={m.id}><td className="muted">{datetime(m.readAt)}</td><td>{m.value} {m.kind === 'KM' ? 'km' : 'h'}</td><td className="muted">{m.source}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <h2>Historique préventif ({preventifs.length})</h2>
            <TicketTable rows={preventifs} showDue />
          </div>
          <div className="card">
            <h2>Historique curatif ({curatifs.length})</h2>
            <TicketTable rows={curatifs} />
          </div>
        </div>
      </div>
    </>
  );
}

function TicketTable({ rows, showDue = false }: { rows: any[]; showDue?: boolean }) {
  if (!rows.length) return <p className="muted">Aucune intervention enregistrée.</p>;
  return (
    <table>
      <thead>
        <tr><th>DI</th><th>Objet</th>{showDue && <th>Échéance</th>}<th>Statut</th><th style={{ textAlign: 'right' }}>Coût</th></tr>
      </thead>
      <tbody>
        {rows.map((t) => {
          const late = showDue && t.dueDate && t.closedAt && new Date(t.closedAt) > new Date(t.dueDate);
          return (
            <tr key={t.id}>
              <td><Link href={`/tickets/${t.id}`}>{t.reference}</Link><div className="muted">{datetime(t.createdAtField)}</div></td>
              <td>{t.title}<div><UrgencyBadge urgency={t.urgency} /></div></td>
              {showDue && <td className={late ? '' : 'muted'} style={late ? { color: 'var(--tone-critical)', fontWeight: 700 } : {}}>{date(t.dueDate)}{late ? ' ⚠' : ''}</td>}
              <td><TicketStatusBadge status={t.status} /></td>
              <td style={{ textAlign: 'right' }}>{t.cost ? money(t.cost) : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
