'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { endpoints } from '@/lib/api';
import { TicketStatusBadge, UrgencyBadge } from '@/components/StatusBadge';
import { TicketWorkflowBar } from '@/components/TicketWorkflowBar';
import { ExternalInvoiceForm } from '@/components/ExternalInvoiceForm';
import { COST_KIND_LABEL, datetime, money, TICKET_STATUS_LABEL, TICKET_TYPE_LABEL } from '@/lib/format';

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: t, isLoading } = useQuery({ queryKey: ['ticket', id], queryFn: () => endpoints.ticket(id) });

  if (isLoading || !t) return <p className="muted">Chargement…</p>;

  return (
    <>
      <div className="shell-head">
        <div>
          <h1>{t.reference}</h1>
          <p className="muted">{t.title}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(t as any).lot && <span className="badge" style={{ background: `${(t as any).lot.color}22`, color: (t as any).lot.color }}>{(t as any).lot.code}</span>}
          <UrgencyBadge urgency={t.urgency} />
          <TicketStatusBadge status={t.status} />
        </div>
      </div>

      <div className="grid grid-2">
        <div>
          <div className="card">
            <h2>Contexte</h2>
            <table>
              <tbody>
                <tr><th>Projet / site</th><td>{t.site.code} · {t.site.name}</td></tr>
                <tr><th>Lot technique</th><td>{(t as any).lot ? `${(t as any).lot.code} · ${(t as any).lot.name}` : '—'}</td></tr>
                <tr><th>Actif concerné</th><td>{t.equipment ? `${t.equipment.assetTag} · ${t.equipment.name}` : '—'}</td></tr>
                <tr><th>Nature</th><td>{TICKET_TYPE_LABEL[t.type] ?? t.type}</td></tr>
                {t.meterAtReport != null && <tr><th>Index compteur</th><td>{t.meterAtReport}</td></tr>}
                {t.dueDate && <tr><th>Échéance préventif</th><td>{datetime(t.dueDate)}</td></tr>}
                <tr><th>Demandeur</th><td>{t.reporter.fullName}</td></tr>
                <tr><th>DI signalée le</th><td>{datetime(t.createdAtField)}</td></tr>
              </tbody>
            </table>
            {t.description && <p style={{ whiteSpace: 'pre-wrap', marginTop: 12 }}>{t.description}</p>}
          </div>

          <div className="card">
            <h2>Suivi</h2>
            <TicketWorkflowBar ticket={t} />
          </div>

          {t.attachments.length > 0 && (
            <div className="card">
              <h2>Médias ({t.attachments.length})</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {t.attachments.map((a) => {
                  const url = (a as any).url as string | null;
                  if (!url) {
                    return (
                      <span key={a.id} className="muted" style={{ fontSize: 12 }}>
                        {a.kind} · stockage non configuré
                      </span>
                    );
                  }
                  if (a.kind === 'PHOTO') {
                    return (
                      <a key={a.id} href={url} target="_blank" rel="noreferrer">
                        <img
                          src={url}
                          alt="Photo terrain"
                          style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }}
                        />
                      </a>
                    );
                  }
                  if (a.kind === 'VOICE_NOTE') {
                    return <audio key={a.id} controls src={url} style={{ width: '100%' }} />;
                  }
                  if (a.kind === 'VIDEO') {
                    return <video key={a.id} controls src={url} style={{ width: 240, borderRadius: 8 }} />;
                  }
                  return (
                    <a key={a.id} href={url} target="_blank" rel="noreferrer" className="btn btn-ghost">
                      ⬇ {a.kind}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {t.signature && (
            <div className="card">
              <h2>Réception — service fait</h2>
              <p>Vérifié et signé par <strong>{t.signature.signerName}</strong> le {datetime(t.signature.signedAt)}.</p>
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <h2>Coûts imputés — {money(t.totalCost)}</h2>
            {t.costLines.length ? (
              <>
                <table>
                  <thead><tr><th>Nature</th><th>Libellé</th><th style={{ textAlign: 'right' }}>Montant</th></tr></thead>
                  <tbody>
                    {t.costLines.map((c) => (
                      <tr key={c.id}>
                        <td>{COST_KIND_LABEL[c.kind]}</td>
                        <td>{c.label}</td>
                        <td style={{ textAlign: 'right' }}>{money(c.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted" style={{ marginTop: 8 }}>
                  {t.costLines.every((c) => c.locked) ? 'Coûts figés (ticket clôturé).' : 'Estimation — figée à la clôture.'}
                </p>
              </>
            ) : (
              <p className="muted">Aucun coût pour l’instant.</p>
            )}
            {t.status !== 'CLOTURE' && <ExternalInvoiceForm ticketId={t.id} />}
          </div>

          <div className="card">
            <h2>Interventions</h2>
            {t.interventions.length ? (
              <table>
                <thead><tr><th>Affecté à</th><th>Planifié</th><th>MO (h)</th><th>km</th></tr></thead>
                <tbody>
                  {t.interventions.map((iv) => (
                    <tr key={iv.id}>
                      <td>{iv.mechanic?.fullName ?? iv.provider?.name ?? iv.assigneeKind}</td>
                      <td className="muted">{datetime(iv.scheduledFor ?? null)}</td>
                      <td>{iv.laborHours ?? '—'}</td>
                      <td>{iv.travelKm ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">Pas encore d’affectation.</p>
            )}
          </div>

          <div className="card">
            <h2>Historique</h2>
            <ul className="timeline">
              {t.events.map((e) => (
                <li key={e.id}>
                  <strong>{TICKET_STATUS_LABEL[e.toStatus as keyof typeof TICKET_STATUS_LABEL] ?? e.toStatus}</strong>
                  {e.actor?.fullName ? ` — ${e.actor.fullName}` : ''}
                  {e.note ? <div className="muted">{e.note}</div> : null}
                  <div><time>{datetime(e.createdAt)}</time></div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
