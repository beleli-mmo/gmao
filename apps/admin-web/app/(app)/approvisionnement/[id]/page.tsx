'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, endpoints, type SupplyDetail } from '@/lib/api';
import { currentSession } from '@/lib/auth';
import { datetime, date, SUPPLY_STATUS_LABEL, SUPPLY_STATUS_TONE } from '@/lib/format';

const errMsg = (e: unknown) =>
  e instanceof ApiError && e.body && typeof e.body === 'object'
    ? ((e.body as any).message ?? (e.body as any).error ?? 'Erreur')
    : (e as Error).message;

function whatsappText(s: SupplyDetail): string {
  const L: string[] = [];
  L.push('🧾 *DEMANDE D’APPROVISIONNEMENT*');
  L.push('━━━━━━━━━━━━━━━━━━');
  L.push(`*Réf. :* ${s.reference}`);
  L.push(`*Chantier :* ${s.site.name}`);
  L.push(`*Objet :* ${s.title}`);
  if (s.needBy) L.push(`*Besoin pour le :* ${new Date(s.needBy).toLocaleDateString('fr-FR')}`);
  if (s.purchaseOrderRef) L.push(`*Bon de commande :* ${s.purchaseOrderRef}`);
  L.push(`*Statut :* ${SUPPLY_STATUS_LABEL[s.status]}`);
  L.push('');
  L.push('*Articles :*');
  s.items.forEach((i) => L.push(`• ${i.label} — ${i.quantity} ${i.unit}`));
  if (s.note?.trim()) { L.push(''); L.push(`*Note :* ${s.note.trim()}`); }
  L.push('━━━━━━━━━━━━━━━━━━');
  L.push('_Émis via Belel GMAO_');
  return L.join('\n');
}

export default function ApproDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const me = currentSession();
  const { data: s, isLoading } = useQuery({ queryKey: ['supply', id], queryFn: () => endpoints.supply(id), refetchInterval: 15_000 });

  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['supply'] }); setNote(''); setErr(null); };

  const review = useMutation({
    mutationFn: (decision: 'VALIDER' | 'ANNULER' | 'MODIFIER') => endpoints.reviewSupply(id, { decision, note: note.trim() || undefined }),
    onSuccess: refresh,
    onError: (e) => setErr(errMsg(e)),
  });
  const receive = useMutation({
    mutationFn: () => endpoints.receiveSupply(id),
    onSuccess: refresh,
    onError: (e) => setErr(errMsg(e)),
  });

  if (isLoading || !s) return <p className="muted">Chargement…</p>;

  const isReviewer = me?.role === 'PARK_MANAGER' || me?.role === 'ADMIN';
  const isOwner = s.requester.id === me?.id;
  const canReview = isReviewer && (s.status === 'DEMANDEE' || s.status === 'A_MODIFIER');
  const canReceive = (isOwner || me?.role === 'ADMIN') && s.status === 'VALIDEE';

  return (
    <>
      <div className="shell-head no-print">
        <div>
          <button className="btn btn-ghost" onClick={() => router.push('/approvisionnement')} style={{ padding: '4px 10px', fontSize: 13 }}>← Approvisionnement</button>
          <h1 style={{ marginTop: 8 }}>{s.reference}</h1>
          <p className="muted">{s.title}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`badge tone-${SUPPLY_STATUS_TONE[s.status]}`}>{SUPPLY_STATUS_LABEL[s.status]}</span>
          <a className="btn btn-ghost" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(whatsappText(s))}`}>Partager (WhatsApp)</a>
        </div>
      </div>

      {err && <p className="card no-print" style={{ color: 'var(--tone-critical)', margin: '0 0 14px' }}>{err}</p>}

      <div className="grid grid-2">
        <div>
          <div className="card">
            <h2>Demande</h2>
            <table>
              <tbody>
                <tr><th>Chantier</th><td>{s.site.name}</td></tr>
                <tr><th>Demandeur</th><td>{s.requester.fullName}</td></tr>
                <tr><th>Créée le</th><td>{datetime(s.createdAt)}</td></tr>
                {s.needBy && <tr><th>Besoin pour</th><td>{date(s.needBy)}</td></tr>}
                {s.validatedBy && <tr><th>Validée par</th><td>{s.validatedBy.fullName} · {datetime(s.validatedAt)}</td></tr>}
                {s.receivedBy && <tr><th>Réception</th><td>{s.receivedBy.fullName} · {datetime(s.receivedAt)}</td></tr>}
                {s.controlledBy && <tr><th>Contrôlée par</th><td>{s.controlledBy.fullName} · {datetime(s.controlledAt)}</td></tr>}
              </tbody>
            </table>
            {s.note && <p style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{s.note}</p>}
            {s.reviewNote && <p className="muted" style={{ marginTop: 8 }}><strong>Décision :</strong> {s.reviewNote}</p>}
          </div>

          <div className="card">
            <h2>Articles ({s.items.length})</h2>
            <table>
              <thead><tr><th>Désignation</th><th style={{ textAlign: 'right' }}>Quantité</th></tr></thead>
              <tbody>
                {s.items.map((i) => (
                  <tr key={i.id}><td>{i.label}{i.note ? <span className="muted"> — {i.note}</span> : null}</td><td style={{ textAlign: 'right' }}>{i.quantity} {i.unit}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          {s.purchaseOrderRef && (
            <div className="card" id="bc">
              <div className="shell-head" style={{ marginBottom: 8 }}>
                <h2 style={{ margin: 0 }}>Bon de commande</h2>
                <button className="btn btn-ghost no-print" onClick={() => window.print()}>🖨 Imprimer le BC</button>
              </div>
              <p style={{ fontSize: 20, fontWeight: 800, margin: '4px 0' }}>{s.purchaseOrderRef}</p>
              <p className="muted" style={{ marginTop: 0 }}>Généré le {datetime(s.purchaseOrderAt)} · chantier {s.site.name} · demande {s.reference}</p>
              <table>
                <thead><tr><th>Désignation</th><th style={{ textAlign: 'right' }}>Quantité</th></tr></thead>
                <tbody>{s.items.map((i) => <tr key={i.id}><td>{i.label}</td><td style={{ textAlign: 'right' }}>{i.quantity} {i.unit}</td></tr>)}</tbody>
              </table>
            </div>
          )}

          {s.attachments.length > 0 && (
            <div className="card">
              <h2>Contrôle terrain — installation vérifiée</h2>
              {s.controlNote && <p style={{ marginTop: 0 }}>{s.controlNote}</p>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {s.attachments.map((a) => a.url ? (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                    <img src={a.url} alt="Contrôle" style={{ width: 150, height: 150, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                  </a>
                ) : <span key={a.id} className="muted" style={{ fontSize: 12 }}>photo indisponible</span>)}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="card no-print">
            <h2>Suivi</h2>
            {canReview && (
              <>
                <textarea rows={2} placeholder="Motif / précision (obligatoire pour une demande de modification)" value={note} onChange={(e) => setNote(e.target.value)}
                  style={{ width: '100%', padding: 9, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', font: 'inherit' }} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  <button className="btn" disabled={review.isPending} onClick={() => review.mutate('VALIDER')}>Valider → générer le BC</button>
                  <button className="btn btn-ghost" disabled={review.isPending} onClick={() => review.mutate('MODIFIER')}>Demander modification</button>
                  <button className="btn btn-ghost" style={{ color: 'var(--tone-critical)' }} disabled={review.isPending} onClick={() => review.mutate('ANNULER')}>Annuler</button>
                </div>
              </>
            )}
            {canReceive && (
              <button className="btn" disabled={receive.isPending} onClick={() => receive.mutate()}>Confirmer la réception</button>
            )}
            {s.status === 'RECUE' && (
              <p className="muted">En attente du contrôle terrain (application GMAO Terrain — rôle Contrôleur).</p>
            )}
            {!canReview && !canReceive && s.status !== 'RECUE' && (
              <p className="muted">Aucune action à ce stade pour votre rôle.</p>
            )}
          </div>

          <div className="card">
            <h2>Journal</h2>
            <ul className="timeline">
              {s.events.map((e) => (
                <li key={e.id}>
                  <strong>{SUPPLY_STATUS_LABEL[e.toStatus] ?? e.toStatus}</strong>
                  {e.actor?.fullName ? ` — ${e.actor.fullName}` : ''}
                  {e.note ? <div className="muted">{e.note}</div> : null}
                  <div><time>{datetime(e.createdAt)}</time></div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          .sidebar, .no-print, .grid > div:last-child { display: none !important; }
          .shell, .shell-main { display: block !important; padding: 0 !important; }
          .card:not(#bc) { display: none !important; }
          #bc { border: 0; }
          @page { margin: 16mm; }
        }
      `}</style>
    </>
  );
}
