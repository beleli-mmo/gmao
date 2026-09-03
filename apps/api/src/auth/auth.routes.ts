import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';

export const authRouter = Router();

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret';
// Outil interne : session longue pour éviter les déconnexions en cours de journée
// (le terrain travaille hors-ligne, l'admin reste ouvert). Surchargeable par env.
const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL ?? '12h';

authRouter.post('/login', async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(6) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  const claims = { id: user.id, role: user.role, fullName: user.fullName };
  const accessToken = jwt.sign(claims, ACCESS_SECRET, { expiresIn: ACCESS_TTL as any });
  const refreshToken = jwt.sign({ id: user.id }, REFRESH_SECRET, { expiresIn: '30d' });
  res.json({ accessToken, refreshToken, user: claims });
});

authRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
  try {
    const { id } = jwt.verify(refreshToken, REFRESH_SECRET) as { id: string };
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    const claims = { id: user.id, role: user.role, fullName: user.fullName };
    res.json({ accessToken: jwt.sign(claims, ACCESS_SECRET, { expiresIn: ACCESS_TTL as any }) });
  } catch {
    res.status(401).json({ error: 'invalid_refresh' });
  }
});
