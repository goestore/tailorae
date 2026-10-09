/**
 * Seed the non-apparel departments, so the storefront nav and the listing
 * form show more than clothing.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/seed-general-categories.ts
 *
 * Idempotent: a category that already exists (by slug) is left exactly as the
 * admin has it — only missing ones are created. Each gets its listing
 * template, so a seller who picks Footwear lists with UK sizes. They start
 * empty; nothing here creates products.
 */
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '@/lib/prisma';
import { templateInfo } from '@/utils/product-spec';

const DEPARTMENTS = [
  { name: 'Footwear', slug: 'footwear', template: 'footwear', description: 'Shoes, sandals and sneakers.' },
  { name: 'Electronics', slug: 'electronics', template: 'electronics', description: 'Gadgets, audio and accessories.' },
  { name: 'Home & Kitchen', slug: 'home-kitchen', template: 'home-kitchen', description: 'Cookware, decor and home essentials.' },
  {
    name: 'Bags & Accessories',
    slug: 'bags-accessories',
    template: 'bags-accessories',
    description: 'Bags, wallets and everyday accessories.',
  },
  {
    name: 'Beauty & Personal Care',
    slug: 'beauty-personal-care',
    template: 'beauty-personal-care',
    description: 'Skin, hair and personal care.',
  },
];

async function main(): Promise<void> {
  // After the apparel departments (Women, Men, Kids), in the order above.
  const last = await prisma.category.aggregate({ where: { parentId: null }, _max: { displayOrder: true } });
  let order = Math.max(3, last._max.displayOrder ?? 0);

  for (const dept of DEPARTMENTS) {
    if (!templateInfo(dept.template)) throw new Error(`Unknown listing template ${dept.template}`);
    const existing = await prisma.category.findUnique({ where: { slug: dept.slug }, select: { id: true } });
    if (existing) {
      console.log(`= ${dept.name} already exists, left as is`);
      continue;
    }
    order += 1;
    await prisma.category.create({
      data: {
        name: dept.name,
        slug: dept.slug,
        description: dept.description,
        listingTemplate: dept.template,
        displayOrder: order,
        isActive: true,
      },
    });
    console.log(`+ ${dept.name} (order ${order}, template ${dept.template})`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
