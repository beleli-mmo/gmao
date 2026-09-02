'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Rafraîchissement des données.
 *  - Si `NEXT_PUBLIC_WS_URL` est défini (API en process long : Render, VPS, local) → WebSocket.
 *  - Sinon (API serverless sur Vercel) → no‑op : le polling de TanStack Query (voir QueryProvider) suffit.
 */
export function useRealtime() {
  const qc = useQueryClient();
  const url = process.env.NEXT_PUBLIC_WS_URL;

  useEffect(() => {
    if (!url) return; // mode polling
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout>;
    let closed = false;

    const connect = () => {
      try {
        ws = new WebSocket(url);
      } catch {
        return;
      }
      ws.onmessage = (msg) => {
        let ev: any;
        try {
          ev = JSON.parse(msg.data);
        } catch {
          return;
        }
        if (ev.type === 'ticket.updated' || ev.type === 'ticket.synced') {
          if (ev.ticketId) qc.invalidateQueries({ queryKey: ['ticket', ev.ticketId] });
          qc.invalidateQueries({ queryKey: ['tickets'] });
          qc.invalidateQueries({ queryKey: ['overview'] });
          qc.invalidateQueries({ queryKey: ['interventions'] });
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, [qc, url]);
}
