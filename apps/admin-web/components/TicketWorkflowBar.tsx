'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { endpoints, type TicketDetail } from '@/lib/api';
import { currentSession } from '@/lib/auth';

/**
 * Barre d'actions du workflow : n'affiche que les transitions permises
 * pour le statut courant ET le rôle de l'utilisateur connecté.
 * (miroir de packages/shared/src/state-machine.ts)
 */
export function TicketWorkflowBar({ ticket }: { ticket: TicketDetail }) {
  const qc = useQueryClient();
  const role = currentSession()?.role;
  const [form, setForm] = useState<Record<string, string>>({});

  const mut = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', ticket.id] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      setForm({});
    },
  });

  const can = (roles: string[]) => role && roles.includes(role);
  const run = (fn: () => Promise<unknown>) => () => mut.mutate(fn);

  const actions: React.ReactNode[] = [];

  if (ticket.status === 'EN_ATTENTE' && can(['PARK_MANAGER', 'ADMIN'])) {
    actions.push(
      <div key="q" className="wf-action">
        <select value={form.urgency ?? ticket.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })}>
          <option value="N1_BLOQUANT">N1 · Bloquant</option>
          <option value="N2_MAJEUR">N2 · Majeur</option>
          <option value="N3_MINEUR">N3 · Mineur</option>
        </select>
        <input
          placeholder="Diagnostic"
          value={form.diagnostic ?? ''}
          onChange={(e) => setForm({ ...form, diagnostic: e.target.value })}
        />
        <button onClick={run(() => endpoints.qualify(ticket.id, { urgency: form.urgency ?? ticket.urgency, diagnostic: form.diagnostic }))}>
          Qualifier →
        </button>
      </div>,
    );
  }

  if (ticket.status === 'QUALIFIE' && can(['PARK_MANAGER', 'ADMIN'])) {
    actions.push(
      <p key="p" className="wf-wait">
        OS qualifié — la planification (affectation + date) se fait dans la rubrique{' '}
        <a href="/planning">Planning</a>.
      </p>,
    );
  }

  if (ticket.status === 'PLANIFIE' && can(['MECHANIC', 'PARK_MANAGER', 'ADMIN'])) {
    actions.push(<button key="s" onClick={run(() => endpoints.start(ticket.id))}>Démarrer l’intervention →</button>);
  }

  if (ticket.status === 'EN_COURS' && can(['MECHANIC', 'PARK_MANAGER', 'ADMIN'])) {
    const iv = ticket.interventions[ticket.interventions.length - 1];
    actions.push(
      <div key="w" className="wf-action">
        <input
          type="number" step="0.5" placeholder="Heures MO"
          value={form.laborHours ?? ''} onChange={(e) => setForm({ ...form, laborHours: e.target.value })}
        />
        <input
          type="number" step="1" placeholder="km déplacement"
          value={form.travelKm ?? ''} onChange={(e) => setForm({ ...form, travelKm: e.target.value })}
        />
        <button
          disabled={!iv || !form.laborHours}
          onClick={run(() =>
            endpoints.workDone(ticket.id, {
              interventionId: iv?.id,
              laborHours: Number(form.laborHours),
              travelKm: form.travelKm ? Number(form.travelKm) : undefined,
              report: form.report,
              partsUsed: [],
            }),
          )}
        >
          Travaux terminés →
        </button>
      </div>,
    );
  }

  if (ticket.status === 'TRAVAUX_TERMINES') {
    actions.push(
      <p key="wait" className="wf-wait">
En attente de la <strong>réception</strong> — vérification du service fait et signature du responsable de site (possible hors ligne).
      </p>,
    );
  }

  if (ticket.status === 'VALIDE_TERRAIN' && can(['PARK_MANAGER', 'ADMIN'])) {
    actions.push(
      <button key="c" onClick={run(() => endpoints.close(ticket.id, { extraCostLines: [] }))}>
        Clôturer & imputer les coûts →
      </button>,
    );
  }

  if (!actions.length) {
    return <p className="wf-none">Aucune action disponible pour votre rôle à ce stade.</p>;
  }

  return (
    <div className="wf">
      {mut.isError && <p className="wf-err">{(mut.error as Error).message}</p>}
      {actions}
    </div>
  );
}
