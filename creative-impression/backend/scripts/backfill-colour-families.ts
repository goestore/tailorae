/**
 * One-off backfill: file every existing product and variant colour under a
 * colour family, so the storefront colour filter covers the whole catalogue.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-colour-families.ts
 *
 * Safe to re-run: rows that already have a family are left alone. Colours no
 * rule recognises are listed so someone can pick their family in the form.
 */
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '@/lib/prisma';
import { canonicalFamily, suggestFamily } from '@/utils/colour-families';

async function main(): Promise<void> {
  const unmatched = new Map<string, number>();

  const variants = await prisma.productVariant.findMany({
    where: { colorFamily: null, color: { not: null } },
    select: { id: true, color: true, product: { select: { colourHexes: true } } },
  });
  let variantsSet = 0;
  for (const variant of variants) {
    const hexes = (variant.product.colourHexes ?? {}) as Record<string, string>;
    const family = suggestFamily(variant.color, hexes[variant.color!] ?? null);
    if (!family) {
      unmatched.set(variant.color!, (unmatched.get(variant.color!) ?? 0) + 1);
      continue;
    }
    await prisma.productVariant.update({ where: { id: variant.id }, data: { colorFamily: family.name } });
    variantsSet++;
  }

  const products = await prisma.product.findMany({
    where: { colorFamily: null },
    select: { id: true, primaryColour: true, brandColour: true, color: true },
  });
  let productsSet = 0;
  for (const product of products) {
    const named = product.brandColour || product.color;
    const family = canonicalFamily(product.primaryColour) ?? suggestFamily(named);
    if (!family) {
      if (named) unmatched.set(named, (unmatched.get(named) ?? 0) + 1);
      continue;
    }
    // Sent explicitly, so the write hook keeps it as is.
    await prisma.product.update({ where: { id: product.id }, data: { colorFamily: family.name } });
    productsSet++;
  }

  console.log(`Variants filed: ${variantsSet} of ${variants.length}`);
  console.log(`Products filed: ${productsSet} of ${products.length}`);
  if (unmatched.size) {
    console.log('Not recognised (pick a family in the listing form):');
    for (const [name, count] of unmatched) console.log(`  - ${name} (${count})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
