/**
 * Turn the keyword-matched Women / Men / Kids sections into real categories.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/migrate-apparel-sections.ts [--dry-run]
 *
 * Until now the storefront's sub-sections (/products/womens/polo-t-shirt …)
 * were not rows: frontend/src/config/catalog.ts described each as its
 * department plus name keywords. This creates them as categories, moves the
 * existing `dresses` category under Kids › Girls, files each product sitting
 * directly on a department into the subcategory those same keywords picked,
 * and marks the homepage tiles (image, showOnHome, homeOrder) so the
 * "Explore all categories" band renders exactly what it did before.
 *
 * Idempotent, in one transaction:
 * - a category that already exists (by slug) keeps whatever the admin has
 *   set on it; only missing ones are created, and only a created one gets its
 *   homepage tile fields (so a re-run never undoes admin changes);
 * - only products filed directly on womens/mens/kids are considered, and one
 *   that matches nothing (or both boys and girls) stays on its department.
 */
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '@/lib/prisma';

interface SectionSpec {
  slug: string;
  name: string;
  description?: string;
  /** Product-name keywords (any) and exclusions (none), as catalog.ts had them. */
  match?: string[];
  exclude?: string[];
  /** Kids sections: which ageGroup they serve. A null ageGroup qualifies for both. */
  audience?: 'boys' | 'girls';
  home?: { order: number; image: string };
  /** Existing category moved here instead of created. */
  adopt?: boolean;
  children?: SectionSpec[];
}

const DEPARTMENTS: Array<{ slug: string; children: SectionSpec[] }> = [
  {
    slug: 'womens',
    children: [
      {
        slug: 'womens-polo-t-shirt',
        name: 'Polo T-Shirts',
        description: 'Cotton piqué polos, cut for a woman’s fit.',
        match: ['polo'],
        home: { order: 1, image: '/images/Women Polo T-Shirt.webp' },
      },
      {
        slug: 'womens-tops-tunics',
        name: 'Tops & Tunics',
        description: 'Everyday tops and longer-line tunics.',
        match: ['top', 'tunic', 'kurti', 'anarkali'],
        home: { order: 3, image: '/images/Women Top.webp' },
      },
      {
        slug: 'womens-round-neck-tshirts',
        name: 'Round Neck T-Shirts',
        description: 'Classic crew-neck tees.',
        match: ['round neck', 't-shirt', 'tee'],
      },
      {
        slug: 'womens-plus-size',
        name: 'Plus Size',
        description: 'Extended sizing across the range.',
        match: ['plus'],
        home: { order: 11, image: '/images/WINTER.webp' },
      },
    ],
  },
  {
    slug: 'mens',
    children: [
      {
        slug: 'mens-polo-t-shirt',
        name: 'Polo T-Shirts',
        description: 'Piqué and interlock polos for work and weekend.',
        match: ['polo'],
        home: { order: 2, image: '/images/Mens Polo T-Shirt.webp' },
      },
      {
        slug: 'mens-round-neck-tshirts',
        name: 'Round Neck T-Shirts',
        description: 'Crew-neck tees in a regular fit.',
        match: ['round neck', 't-shirt', 'tee'],
        home: { order: 4, image: '/images/Round Neck T-Shirt.webp' },
      },
      {
        slug: 'mens-shirts',
        name: 'Shirts',
        description: 'Formal and casual shirting.',
        match: ['shirt', 'chino'],
        exclude: ['t-shirt', 'tee', 'polo'],
        home: { order: 6, image: '/images/Mens Shirt.webp' },
      },
    ],
  },
  {
    slug: 'kids',
    children: [
      {
        slug: 'kids-boys',
        name: 'Boys',
        description: 'Polos and tees for boys.',
        children: [
          {
            slug: 'kids-boys-polo-t-shirt',
            name: 'Polo T-Shirts',
            description: 'Hard-wearing polos for boys.',
            match: ['polo'],
            audience: 'boys',
            home: { order: 5, image: '/images/Boys Polo T-Shirts.webp' },
          },
          {
            slug: 'kids-boys-round-neck-t-shirt',
            name: 'Round Neck T-Shirts',
            description: 'Everyday crew-neck tees for boys.',
            match: ['tee', 't-shirt'],
            audience: 'boys',
            home: { order: 7, image: '/images/WINTER.webp' },
          },
        ],
      },
      {
        slug: 'kids-girls',
        name: 'Girls',
        description: 'Polos, tees, tops and party wear for girls.',
        children: [
          {
            slug: 'kids-girls-polo-t-shirt',
            name: 'Polo T-Shirts',
            description: 'Soft-touch polos for girls.',
            match: ['polo'],
            audience: 'girls',
            home: { order: 8, image: '/images/WINTER.webp' },
          },
          {
            slug: 'kids-girls-round-neck-t-shirt',
            name: 'Round Neck T-Shirts',
            description: 'Everyday crew-neck tees for girls.',
            match: ['tee', 't-shirt'],
            audience: 'girls',
          },
          {
            slug: 'kids-girls-tops',
            name: 'Tops',
            description: 'Tops, frocks and party wear.',
            // Dresses and frocks now have their own category (below), checked first.
            match: ['top'],
            audience: 'girls',
            home: { order: 9, image: '/images/WINTER.webp' },
          },
          {
            slug: 'dresses',
            name: 'Dresses',
            description: 'Frocks, party dresses and everyday dresses.',
            match: ['dress', 'frock'],
            audience: 'girls',
            adopt: true,
          },
        ],
      },
    ],
  },
];

/** The order products are tested against, per department: first match wins. */
const MATCH_ORDER: Record<string, string[]> = {
  womens: ['womens-polo-t-shirt', 'womens-tops-tunics', 'womens-round-neck-tshirts', 'womens-plus-size'],
  mens: ['mens-polo-t-shirt', 'mens-round-neck-tshirts', 'mens-shirts'],
  kids: [
    'kids-boys-polo-t-shirt',
    'kids-boys-round-neck-t-shirt',
    'kids-girls-polo-t-shirt',
    'kids-girls-round-neck-t-shirt',
    'dresses',
    'kids-girls-tops',
  ],
};

const flatten = (specs: SectionSpec[]): SectionSpec[] =>
  specs.flatMap((s) => [s, ...flatten(s.children ?? [])]);

const nameMatches = (name: string, spec: SectionSpec): boolean => {
  const n = name.toLowerCase();
  if (!spec.match?.some((w) => n.includes(w))) return false;
  return !spec.exclude?.some((w) => n.includes(w));
};

/** catalog.ts's audience rule: ageGroup contains it, or there is no ageGroup. */
const audienceMatches = (ageGroup: string | null, spec: SectionSpec): boolean =>
  !spec.audience || ageGroup === null || ageGroup.toLowerCase().includes(spec.audience);

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const report = {
    created: [] as string[],
    existing: [] as string[],
    moved: [] as string[],
    productsMoved: [] as string[],
    productsKept: [] as string[],
  };

  await prisma.$transaction(
    async (tx) => {
      for (const dept of DEPARTMENTS) {
        const root = await tx.category.findUnique({ where: { slug: dept.slug } });
        if (!root) throw new Error(`Department ${dept.slug} is missing — run the seed first`);

        const ensure = async (specs: SectionSpec[], parentId: string, trail: string) => {
          for (const [index, spec] of specs.entries()) {
            const label = `${trail} › ${spec.name} (${spec.slug})`;
            let row = await tx.category.findUnique({ where: { slug: spec.slug } });
            if (row && spec.adopt && row.parentId !== parentId) {
              row = await tx.category.update({
                where: { id: row.id },
                data: {
                  parentId,
                  displayOrder: index + 1,
                  description: row.description ?? spec.description ?? null,
                },
              });
              report.moved.push(label);
            } else if (row) {
              report.existing.push(label);
            } else {
              row = await tx.category.create({
                data: {
                  name: spec.name,
                  slug: spec.slug,
                  description: spec.description ?? null,
                  parentId,
                  displayOrder: index + 1,
                  isActive: true,
                  ...(spec.home
                    ? { image: spec.home.image, showOnHome: true, homeOrder: spec.home.order }
                    : {}),
                },
              });
              report.created.push(label + (spec.home ? ` [home #${spec.home.order}]` : ''));
            }
            if (spec.children) await ensure(spec.children, row.id, `${trail} › ${spec.name}`);
          }
        };
        await ensure(dept.children, root.id, root.name);

        // File the products sitting directly on the department.
        const specs = new Map(flatten(dept.children).map((s) => [s.slug, s]));
        const ids = new Map(
          (
            await tx.category.findMany({
              where: { slug: { in: [...specs.keys()] } },
              select: { id: true, slug: true },
            })
          ).map((c) => [c.slug, c.id])
        );
        const products = await tx.product.findMany({
          where: { categoryId: root.id },
          select: { id: true, name: true, ageGroup: true },
        });
        for (const product of products) {
          const hits = MATCH_ORDER[dept.slug]
            .map((slug) => specs.get(slug)!)
            .filter((spec) => nameMatches(product.name, spec) && audienceMatches(product.ageGroup, spec));
          // No ageGroup and it fits both boys and girls: it was showing in both
          // sections, so it stays on Kids rather than picking one arbitrarily.
          const audiences = new Set(hits.map((h) => h.audience).filter(Boolean));
          const target = audiences.size > 1 ? undefined : hits[0];
          if (!target) {
            report.productsKept.push(
              `${root.name}: ${product.name}${audiences.size > 1 ? ' (fits boys and girls)' : ''}`
            );
            continue;
          }
          await tx.product.update({ where: { id: product.id }, data: { categoryId: ids.get(target.slug)! } });
          report.productsMoved.push(`${product.name} → ${target.slug}`);
        }
      }
      if (dryRun) throw new Error('DRY_RUN');
    },
    { timeout: 60_000 }
  ).catch((error: Error) => {
    if (error.message !== 'DRY_RUN') throw error;
  });

  const section = (title: string, rows: string[]) => {
    console.log(`\n${title} (${rows.length})`);
    rows.forEach((r) => console.log(`  ${r}`));
  };
  console.log(dryRun ? '=== DRY RUN — nothing written ===' : '=== Apparel sections migrated ===');
  section('Categories created', report.created);
  section('Categories already present', report.existing);
  section('Categories moved', report.moved);
  section('Products moved', report.productsMoved);
  section('Products left on their department', report.productsKept);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
