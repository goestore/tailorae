import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// The store starts empty: no categories, products, brands, sellers or demo
// customers. The only row created here is the platform admin, so someone can
// sign in and build the catalogue from the admin console.
//
// Credentials come from the environment rather than this file — a password
// committed to the repository is a password everyone with a clone knows.
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env before seeding.');
  }
  if (password.length < 10) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 10 characters.');
  }

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN', status: 'ACTIVE' },
    create: {
      email,
      password: await bcrypt.hash(password, 10),
      firstName: 'Admin',
      lastName: 'TAILORAE',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  console.log(`Seed complete. Admin: ${admin.email} (id: ${admin.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
