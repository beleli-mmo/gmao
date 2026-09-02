import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@gmao/shared';

export interface AuthUser {
  id: string;
  role: Role;
  fullName: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'missing_token' });
  try {
    const payload = jwt.verify(header.slice(7), ACCESS_SECRET) as AuthUser & { exp: number };
    req.user = { id: payload.id, role: payload.role, fullName: payload.fullName };
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden', need: roles });
    next();
  };
}
