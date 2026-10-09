/**
 * One-off cleanup: remove the shops, accounts and listings left behind by
 * end-to-end test runs, and the duplicate draft rows from the first import.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/cleanup-test-data.ts
 *
 * Runs in one transaction. A product that already appears in an order is
 * never deleted; it is reported and left alone.
 */
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '@/lib/prisma';

// Test-run accounts all use example.com. "Creative Kids Studio" is kept: it
// owns a live listing with real photography.
const KEEP_SHOPS = ['Creative Kids Studio'];

async function counts() {
  const [products, live, vendors, users, variants] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { status: 'ACTIVE', moderationStatus: 'APPROVED' } }),
    prisma.vendorProfile.count(),
    prisma.user.count(),
    prisma.productVariant.count(),
  ]);
  return { products, live, vendors, users, variants };
}

async function main(): Promise<void> {
  console.log('Before:', await counts());

  const testShops = await prisma.vendorProfile.findMany({
    where: {
      user: { email: { endsWith: '@example.com' } },
      shopName: { notIn: KEEP_SHOPS },
    },
    select: { id: true, shopName: true, userId: true },
  });
  const testShopIds = testShops.map((s) => s.id);

  // Test listings: everything a test shop owns, plus named test rows.
  const named = await prisma.product.findMany({
    where: {
      OR: [
        { vendorId: { in: testShopIds } },
        { name: { startsWith: 'Test Kurta' } },
        { name: { in: ['Lata test dress', 'Test Linen Shirt'] } },
      ],
    },
    select: { id: true, name: true },
  });

  // Duplicate draft rows from the import: keep the newest of each name.
  const dupes = await prisma.$queryRaw<{ id: string; name: string }[]>`
    SELECT id, name FROM (
      SELECT id, name, row_number() OVER (PARTITION BY name ORDER BY "createdAt" DESC) AS rn
      FROM "Product" WHERE status = 'DRAFT'
    ) t WHERE rn > 1`;

  const candidates = [...named, ...dupes.filter((d) => !named.some((n) => n.id === d.id))];
  const ordered = await prisma.orderItem.findMany({
    where: { productId: { in: candidates.map((c) => c.id) } },
    select: { productId: true },
    distinct: ['productId'],
  });
  const orderedIds = new Set(ordered.map((o) => o.productId));
  const toDelete = candidates.filter((c) => !orderedIds.has(c.id));
  for (const c of candidates.filter((c) => orderedIds.has(c.id))) {
    console.log(`Kept (has orders): ${c.name}`);
  }
  const ids = toDelete.map((p) => p.id);

  await prisma.$transaction(async (tx) => {
    // CartItem → Product is RESTRICT; everything else cascades.
    await tx.cartItem.deleteMany({ where: { productId: { in: ids } } });
    await tx.product.deleteMany({ where: { id: { in: ids } } });
    await tx.brand.deleteMany({ where: { ownerVendorId: { in: testShopIds } } });
    // Deleting the user cascades its shop, cart, sessions and addresses.
    // None of these accounts has placed an order.
    await tx.user.deleteMany({ where: { id: { in: testShops.map((s) => s.userId) } } });
  });

  console.log(`Deleted ${toDelete.length} products:`);
  for (const p of toDelete) console.log(`  - ${p.name}`);
  console.log(`Deleted ${testShops.length} test shops: ${testShops.map((s) => s.shopName).join(', ')}`);
  console.log('After:', await counts());
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
