import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';

export const usersRouter = Router();
usersRouter.use(requireAuth);

const ROLES = ['FIELD_MANAGER', 'PARK_MANAGER', 'MECHANIC', 'ADMIN'] as const;
const publicUser = { id: true, fullName: true, email: true, phone: true, role: true, active: true, createdAt: true } as const;

/** Annuaire — alimente les listes déroulantes ET la page « Équipe & accès ». */
usersRouter.get('/', async (req, res, next) => {
  try {
    const { role, all } = z
      .object({ role: z.enum(ROLES).optional(), all: z.coerce.boolean().optional() })
      .parse(req.query);
    const data = await prisma.user.findMany({
      where: { ...(all ? {} : { active: true }), ...(role ? { role } : {}) },
      select: publicUser,
      orderBy: [{ active: 'desc' }, { fullName: 'asc' }],
    });
    res.json({ data });
  } catch (e) {
    next(e);
  }
});

// ── CRÉATION d'un compte (chef de chantier, mécanicien, responsable…) ──
const CreateUserBody = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  role: z.enum(ROLES),
  phone: z.string().max(40).optional(),
  password: z.string().min(8).max(128),
});

usersRouter.post('/', requireRole('ADMIN', 'PARK_MANAGER'), async (req, res, next) => {
  try {
    const b = CreateUserBody.parse(req.body);
    // un responsable parc ne peut pas créer d'administrateur
    if (b.role === 'ADMIN' && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'role_admin_reserve' });
    }
    const user = await prisma.user.create({
      data: {
        fullName: b.fullName.trim(),
        email: b.email.toLowerCase().trim(),
        role: b.role,
        phone: b.phone?.trim() || null,
        passwordHash: await bcrypt.hash(b.password, 10),
      },
      select: publicUser,
    });
    res.status(201).json(user);
  } catch (e: any) {
    if (e?.code === 'P2002') return res.status(409).json({ error: 'email_deja_utilise' });
    next(e);
  }
});

// ── MODIFICATION : rôle, coordonnées, activation, réinit. mot de passe ──
const UpdateUserBody = z.object({
  fullName: z.string().min(2).max(120).optional(),
  role: z.enum(ROLES).optional(),
  phone: z.string().max(40).nullish(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(128).optional(),
});

usersRouter.patch('/:id', requireRole('ADMIN', 'PARK_MANAGER'), async (req, res, next) => {
  try {
    const b = UpdateUserBody.parse(req.body);
    const self = req.params.id === req.user!.id;
    if (self && (b.role !== undefined || b.active === false)) {
      return res.status(400).json({ error: 'auto_modification_interdite' });
    }
    if (b.role === 'ADMIN' && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'role_admin_reserve' });
    }

    const data: Record<string, unknown> = {};
    if (b.fullName !== undefined) data.fullName = b.fullName.trim();
    if (b.role !== undefined) data.role = b.role;
    if (b.phone !== undefined) data.phone = b.phone?.trim() || null;
    if (b.active !== undefined) data.active = b.active;
    if (b.password) data.passwordHash = await bcrypt.hash(b.password, 10);

    const user = await prisma.user.update({ where: { id: req.params.id }, data, select: publicUser });
    res.json(user);
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'introuvable' });
    next(e);
  }
});
