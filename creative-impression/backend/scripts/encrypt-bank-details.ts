/**
 * One-off backfill: encrypt seller bank account numbers stored before
 * field encryption existed.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/encrypt-bank-details.ts
 *
 * Safe to run more than once. Rows that are already encrypted are skipped,
 * and each row is checked to decrypt back to the original before moving on.
 */
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '@/lib/prisma';
import { decryptField, encryptField, isEncrypted } from '@/utils/field-crypto';

async function main(): Promise<void> {
  const shops = await prisma.vendorProfile.findMany({
    where: { bankAccountNumber: { not: null } },
    select: { id: true, shopName: true, bankAccountNumber: true },
  });

  let encrypted = 0;
  for (const shop of shops) {
    const plain = shop.bankAccountNumber!;
    if (isEncrypted(plain)) continue;

    const stored = encryptField(plain)!;
    if (decryptField(stored) !== plain) {
      throw new Error(`Round-trip check failed for ${shop.shopName}; nothing written for this row`);
    }
    await prisma.vendorProfile.update({ where: { id: shop.id }, data: { bankAccountNumber: stored } });
    encrypted += 1;
  }

  console.log(`Checked ${shops.length} shop(s); encrypted ${encrypted}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
