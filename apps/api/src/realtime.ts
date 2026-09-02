/**
 * Diffusion temps réel découplée du serveur HTTP.
 * `server.ts` enregistre un émetteur WebSocket via `setBroadcaster` quand l'API
 * tourne comme process long ; ailleurs (serverless, worker) c'est un no‑op.
 */
type Broadcaster = (payload: unknown) => void;

let current: Broadcaster = () => {};

export function setBroadcaster(fn: Broadcaster) {
  current = fn;
}

export function broadcast(payload: unknown) {
  try {
    current(payload);
  } catch (e) {
    console.error('[broadcast]', e);
  }
}
