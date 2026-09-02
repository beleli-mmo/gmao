import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { authRouter } from './auth/auth.routes';
import { ticketsRouter } from './modules/tickets.routes';
import { equipmentRouter } from './modules/equipment.routes';
import { stockRouter } from './modules/stock.routes';
import { analyticsRouter } from './modules/analytics.routes';
import { interventionsRouter } from './modules/interventions.routes';
import { sitesRouter } from './modules/sites.routes';
import { usersRouter } from './modules/users.routes';
import { providersRouter } from './modules/providers.routes';
import { lotsRouter } from './modules/lots.routes';
import { syncRouter } from './modules/sync.routes';
import { setBroadcaster } from './realtime';
export { broadcast } from './realtime';

export const app = express();
const origins = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins && origins.length ? origins : true }));
app.use(express.json({ limit: '12mb' })); // marge pour les DI terrain avec photos en base64

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/api/auth', authRouter);
app.use('/api/sync', syncRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/equipment', equipmentRouter);
app.use('/api/stock', stockRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/interventions', interventionsRouter);
app.use('/api/sites', sitesRouter);
app.use('/api/users', usersRouter);
app.use('/api/providers', providersRouter);
app.use('/api/lots', lotsRouter);

// gestion d'erreurs centralisée
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) return res.status(422).json({ error: 'validation', issues: err.issues });
  const status = err.httpStatus ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.code ?? 'internal', message: err.message });
});

process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

/**
 * Process long (local, Render, VPS) → serveur HTTP + WebSocket temps réel.
 * Serverless (Vercel) → seul `app` est exporté, l'admin rafraîchit par polling.
 */
const isServerless = process.env.VERCEL === '1' || process.env.SERVERLESS === '1';

export async function startServer() {
  const { WebSocketServer, WebSocket } = await import('ws');
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Set<InstanceType<typeof WebSocket>>();
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
  });
  setBroadcaster((payload) => {
    const msg = JSON.stringify(payload);
    for (const ws of clients) if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });

  const PORT = Number(process.env.PORT ?? 4000);
  server.listen(PORT, () => console.log(`API GMAO sur http://localhost:${PORT}`));
}

if (!isServerless) {
  startServer().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
