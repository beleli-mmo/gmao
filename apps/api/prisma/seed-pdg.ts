import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'pdg@belel.local';
  const passwordHash = await bcrypt.hash('belel1234', 10);
  const u = await prisma.user.upsert({
    where: { email },
    update: { role: 'DIRECTION' as any, active: true, passwordHash },
    create: { email, fullName: 'Direction Belel', role: 'DIRECTION' as any, active: true, passwordHash },
    select: { id: true, email: true, role: true },
  });
  console.log('OK', u);
}

main().finally(() => prisma.$disconnect());
