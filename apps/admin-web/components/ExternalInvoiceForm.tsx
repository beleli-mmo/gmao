'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';

/** Rattache une facture prestataire à un ticket → recalcule les coûts imputés (FACTURE_EXTERNE). */
export function ExternalInvoiceForm({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ invoiceRef: '', amountHT: '', vatAmount: '', invoiceDate: new Date().toISOString().slice(0, 10) });

  const add = useMutation({
    mutationFn: () =>
      endpoints.addExternalInvoice(ticketId, {
        invoiceRef: f.invoiceRef.trim(),
        amountHT: Number(f.amountHT),
        vatAmount: Number(f.vatAmount || 0),
        invoiceDate: f.invoiceDate,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      setF({ invoiceRef: '', amountHT: '', vatAmount: '', invoiceDate: new Date().toISOString().slice(0, 10) });
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => setOpen(true)}>
        + Facture externe
      </button>
    );
  }

  return (
    <form
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}
      onSubmit={(e) => { e.preventDefault(); if (f.invoiceRef && f.amountHT) add.mutate(); }}
    >
      <input style={s} placeholder="N° facture" value={f.invoiceRef} onChange={(e) => setF({ ...f, invoiceRef: e.target.value })} />
      <input style={s} type="number" placeholder="Montant HT" value={f.amountHT} onChange={(e) => setF({ ...f, amountHT: e.target.value })} />
      <input style={s} type="number" placeholder="TVA" value={f.vatAmount} onChange={(e) => setF({ ...f, vatAmount: e.target.value })} />
      <input style={s} type="date" value={f.invoiceDate} onChange={(e) => setF({ ...f, invoiceDate: e.target.value })} />
      <button className="btn" disabled={!f.invoiceRef || !f.amountHT || add.isPending}>{add.isPending ? '…' : 'Ajouter'}</button>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Annuler</button>
      {add.isError && <p style={{ color: 'var(--tone-critical)', width: '100%', margin: 0 }}>{(add.error as Error).message}</p>}
    </form>
  );
}

const s: React.CSSProperties = {
  padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 7,
  background: 'var(--surface)', color: 'var(--text)', width: 120,
};
