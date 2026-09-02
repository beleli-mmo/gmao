// Point d'entrée serverless (Vercel) — réutilise l'app Express sans écouter de port.
// Sur Vercel, VERCEL=1 est déjà positionné ⇒ server.ts n'appelle pas startServer().
import { app } from '../src/server';

export default app;
