import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Image paths reference files that actually exist in frontend/public/images
const IMAGES = {
  female: '/images/Female Model.png',
  male: '/images/Male Model.png',
  cloth: '/images/tailor-cloth-f20a30ae-0b2d-4bd1-af6c-ca7ab7e2e22d.png',
  customize: '/images/Banner Customize.png',
  generic: '/images/image-75da6dc8-341d-4003-95d7-cade20431392.png',
};

async function main() {
  // ---- Users ----
  const adminPassword = await bcrypt.hash('Admin@123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@creative-impression.local' },
    update: { role: 'ADMIN', status: 'ACTIVE' },
    create: {
      email: 'admin@creative-impression.local',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  const demoPassword = await bcrypt.hash('Demo@123', 10);
  await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      password: demoPassword,
      firstName: 'Demo',
      lastName: 'Customer',
      role: 'RETAIL_CUSTOMER',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  // ---- Demo catalog ----
  // Only seed the catalog into an EMPTY database — this project's dev DB
  // already carries a curated Tailorae catalog that must not be polluted.
  const existingProducts = await prisma.product.count();
  if (existingProducts > 0) {
    console.log(`Catalog already populated (${existingProducts} products) — skipping demo catalog seed.`);
    console.log('Seed complete (users only).');
    console.log(`  Admin:  admin@creative-impression.local / Admin@123 (id: ${admin.id})`);
    console.log('  Demo:   demo@example.com / Demo@123');
    return;
  }

  // ---- Categories ----
  const categoryDefs = [
    { name: 'Women', slug: 'womens', description: "Women's custom apparel and fashion", displayOrder: 1 },
    { name: 'Men', slug: 'mens', description: "Men's custom apparel and fashion", displayOrder: 2 },
    { name: 'Kids', slug: 'kids', description: 'Custom apparel for kids', displayOrder: 3 },
  ];
  const categories: Record<string, string> = {};
  for (const def of categoryDefs) {
    const cat = await prisma.category.upsert({
      where: { slug: def.slug },
      update: {},
      create: def,
    });
    categories[def.slug] = cat.id;
  }

  // ---- Products ----
  const productDefs = [
    {
      name: 'Classic Tailored Kurti',
      slug: 'classic-tailored-kurti',
      sku: 'CI-W-KUR-001',
      category: 'womens',
      price: 899,
      originalPrice: 1199,
      discountPercentage: 25,
      shortDescription: 'Elegant custom-fit kurti in premium cotton.',
      description:
        'A timeless kurti tailored to your measurements. Premium breathable cotton with a flattering silhouette; available with custom embroidery.',
      thumbnail: IMAGES.female,
      images: [IMAGES.female, IMAGES.cloth],
      isFeatured: true,
      isCustomizable: true,
      quantity: 120,
      material: 'Cotton',
    },
    {
      name: 'Designer Anarkali Suit',
      slug: 'designer-anarkali-suit',
      sku: 'CI-W-ANA-002',
      category: 'womens',
      price: 2499,
      originalPrice: 2999,
      discountPercentage: 17,
      shortDescription: 'Flowing anarkali with hand-finished detailing.',
      description: 'Custom-stitched anarkali suit with hand-finished embroidery and premium lining, made to your measurements.',
      thumbnail: IMAGES.female,
      images: [IMAGES.female],
      isFeatured: true,
      isCustomizable: true,
      quantity: 60,
      material: 'Georgette',
    },
    {
      name: 'Custom Printed T-Shirt',
      slug: 'custom-printed-t-shirt',
      sku: 'CI-M-TSH-003',
      category: 'mens',
      price: 299,
      originalPrice: 399,
      discountPercentage: 25,
      shortDescription: 'Upload your design — we print and ship.',
      description:
        '180 GSM bio-washed cotton tee with front/back print options. Upload your logo or artwork and preview a live mockup before ordering.',
      thumbnail: IMAGES.customize,
      images: [IMAGES.customize, IMAGES.male],
      isFeatured: true,
      isCustomizable: true,
      quantity: 500,
      material: 'Cotton',
    },
    {
      name: 'Tailored Formal Shirt',
      slug: 'tailored-formal-shirt',
      sku: 'CI-M-SHT-004',
      category: 'mens',
      price: 1099,
      shortDescription: 'Made-to-measure formal shirt.',
      description: 'Crisp formal shirt cut to your exact measurements. Choice of collar, cuff, and monogram embroidery.',
      thumbnail: IMAGES.male,
      images: [IMAGES.male, IMAGES.cloth],
      isFeatured: true,
      isCustomizable: true,
      quantity: 200,
      material: 'Cotton blend',
    },
    {
      name: 'Classic Chinos',
      slug: 'classic-chinos',
      sku: 'CI-M-CHN-005',
      category: 'mens',
      price: 1299,
      shortDescription: 'Comfort-stretch chinos, tailored fit.',
      description: 'Versatile chinos in comfort-stretch twill, available in tailored and relaxed fits.',
      thumbnail: IMAGES.male,
      images: [IMAGES.male],
      quantity: 150,
      material: 'Twill',
    },
    {
      name: 'Kids Party Frock',
      slug: 'kids-party-frock',
      sku: 'CI-K-FRK-006',
      category: 'kids',
      price: 799,
      originalPrice: 999,
      discountPercentage: 20,
      shortDescription: 'Custom party frock for little ones.',
      description: 'Soft, skin-friendly party frock, custom-stitched with adjustable sizing for growing kids.',
      thumbnail: IMAGES.generic,
      images: [IMAGES.generic],
      isFeatured: true,
      isCustomizable: true,
      quantity: 80,
      material: 'Cotton',
    },
    {
      name: 'Kids Printed Tee',
      slug: 'kids-printed-tee',
      sku: 'CI-K-TSH-007',
      category: 'kids',
      price: 249,
      shortDescription: 'Fun printed tees for kids.',
      description: 'Soft cotton tee with playful prints; add a custom name print at no extra cost.',
      thumbnail: IMAGES.generic,
      images: [IMAGES.generic, IMAGES.customize],
      isCustomizable: true,
      quantity: 300,
      material: 'Cotton',
    },
    {
      name: 'Corporate Polo (Bulk)',
      slug: 'corporate-polo-bulk',
      sku: 'CI-B-POL-008',
      category: 'mens',
      price: 449,
      shortDescription: 'Embroidered polos for teams and events.',
      description:
        'Premium pique polo with custom logo embroidery. Ideal for corporate teams, events, and uniforms. Bulk pricing available.',
      thumbnail: IMAGES.male,
      images: [IMAGES.male, IMAGES.customize],
      isCustomizable: true,
      allowBulkOrders: true,
      minOrderQuantity: 1,
      quantity: 1000,
      material: 'Pique cotton',
    },
  ];

  for (const def of productDefs) {
    const { category, ...data } = def;
    const product = await prisma.product.upsert({
      where: { slug: def.slug },
      update: {},
      create: {
        ...data,
        status: 'ACTIVE',
        categoryId: categories[category],
      },
    });

    // Bulk pricing tiers for the corporate polo
    if (def.slug === 'corporate-polo-bulk') {
      const existing = await prisma.bulkPricing.findFirst({ where: { productId: product.id } });
      if (!existing) {
        await prisma.bulkPricing.createMany({
          data: [
            { productId: product.id, minQty: 50, maxQty: 199, discount: 10, price: 404 },
            { productId: product.id, minQty: 200, maxQty: 499, discount: 20, price: 359 },
            { productId: product.id, minQty: 500, maxQty: null, discount: 30, price: 314 },
          ],
        });
      }
    }

    // Customization options for customizable products
    if (def.isCustomizable) {
      const existing = await prisma.productCustomization.findFirst({ where: { productId: product.id } });
      if (!existing) {
        await prisma.productCustomization.createMany({
          data: [
            {
              productId: product.id,
              name: 'Print Location',
              type: 'text',
              isRequired: false,
              options: JSON.stringify(['Front', 'Back', 'Front & Back']),
              additionalCost: 0,
            },
            {
              productId: product.id,
              name: 'Custom Text',
              type: 'text',
              isRequired: false,
              maxCharacters: 30,
              additionalCost: 49,
            },
            {
              productId: product.id,
              name: 'Logo Upload',
              type: 'image',
              isRequired: false,
              allowedFileTypes: 'png,jpg,jpeg,svg',
              maxFileSize: 5120,
              additionalCost: 99,
            },
          ],
        });
      }
    }
  }

  // ---- Banners ----
  const bannerCount = await prisma.banner.count();
  if (bannerCount === 0) {
    await prisma.banner.createMany({
      data: [
        {
          title: 'Tailored For You',
          subtitle: 'Custom-fit fashion, stitched to your measurements',
          image: IMAGES.female,
          imageAlt: 'Woman in tailored outfit',
          link: '/products',
          position: 'HOMEPAGE',
          type: 'HERO',
          displayOrder: 1,
        },
        {
          title: 'Bulk Orders for Business',
          subtitle: 'Uniforms, corporate wear and event merchandise',
          image: IMAGES.male,
          imageAlt: 'Man in tailored outfit',
          link: '/b2b',
          position: 'HOMEPAGE',
          type: 'PROMOTIONAL',
          displayOrder: 2,
        },
      ],
    });
  }

  // ---- Coupon ----
  await prisma.coupon.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: {
      code: 'WELCOME10',
      description: '10% off your first order',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderAmount: 499,
      maxDiscount: 500,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2027-12-31'),
      isActive: true,
    },
  });

  console.log('Seed complete.');
  console.log(`  Admin:  admin@creative-impression.local / Admin@123 (id: ${admin.id})`);
  console.log('  Demo:   demo@example.com / Demo@123');
  console.log('  Coupon: WELCOME10 (10% off, min ₹499)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
