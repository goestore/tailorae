import { Router, Response } from 'express';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { authMiddleware, adminOnly, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { slugify } from '@/utils/catalog-csv';
import { revalidateCatalog } from '@/utils/revalidate';
import { CANONICAL_FIELDS, type CanonicalField } from '@/utils/sheet-columns';
import {
  IMAGE_ANGLE_ORDER,
  missingForLiveOf,
  normaliseRows,
  parseSheet,
  sanitiseListing,
  sanitiseVariantListing,
  sizeChartFrom,
  titleCase,
  type ImportRow,
  type Issue,
  type NormalisedProduct,
} from '@/utils/sheet-import';
import { missingForLive, type ListingSnapshot, type MissingField } from '@/utils/product-spec';
import { categoryColumns } from '@/utils/category-fields';

/**
 * Listing a catalogue from a marketplace sheet.
 *
 * Two steps, always. `POST /review` reads the files and answers with what it
 * found — every product, every size, and every assumption it had to make —
 * without touching the database. `POST /commit` takes back the reviewed list,
 * as edited, and writes it.
 *
 * The review payload travels through the browser rather than being staged
 * server-side. That is what makes the edits on the review screen instant: an
 * operator fixing a category on forty products is changing a local list, not
 * making forty round trips. The cost is that a very large batch has to be
 * committed in the same session it was reviewed in.
 */

const router = Router();
router.use(authMiddleware, adminOnly);

/**
 * Sheets are read into memory rather than to disk: they are parsed once and
 * thrown away, and a temp file that outlives the request is a catalogue of
 * someone's pricing sitting on the box.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, callback) => {
    if (/\.(xlsx|xlsm|csv)$/i.test(file.originalname)) {
      callback(null, true);
      return;
    }
    callback(new Error('Only .xlsx and .csv files can be imported'));
  },
});

/** What the review screen needs to show, per product. */
interface ReviewProduct extends NormalisedProduct {
  /** Matches an existing product by article number or by any of its SKUs. */
  action: 'create' | 'update';
  existingId: string | null;
  /** True when this category does not exist yet and would be created. */
  newCategory: boolean;
  newBrand: boolean;
  sizeChart: string;
  /** Required template fields still empty: committed as a draft until filled. */
  missingForLive: MissingField[];
}

/**
 * @route POST /admin/catalog-import/review
 * @description Read one or more listing sheets and report what they contain
 * @access Admin only
 */
router.post('/review', upload.array('files', 20), async (req: AuthRequest, res: Response) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      res.status(400).json({ success: false, message: 'Choose at least one sheet' });
      return;
    }

    // A column the importer did not recognise can be mapped by hand on the
    // review screen; those choices come back here on the next pass.
    let overrides: Record<string, CanonicalField> = {};
    if (typeof req.body?.overrides === 'string' && req.body.overrides.trim()) {
      try {
        overrides = JSON.parse(req.body.overrides);
      } catch {
        res.status(400).json({ success: false, message: 'Column mapping could not be read' });
        return;
      }
    }

    const rows: ImportRow[] = [];
    const sheets: Array<{
      file: string;
      sheet: string;
      rows: number;
      unmapped: string[];
      articleType: string | null;
    }> = [];

    for (const file of files) {
      const parsed = await parseSheet(file.buffer, file.originalname, overrides);
      sheets.push({
        file: parsed.file,
        sheet: parsed.sheet,
        rows: parsed.rows.length,
        unmapped: parsed.unmapped,
        articleType: parsed.articleType,
      });
      rows.push(...parsed.rows);
    }

    if (rows.length === 0) {
      res.status(400).json({
        success: false,
        message:
          'No product rows were found. The header could not be identified — map a few columns and try again.',
        data: { sheets },
      });
      return;
    }

    const products = normaliseRows(rows);

    // ── What already exists ─────────────────────────────────────────────
    const articleNumbers = products.map((product) => product.articleNumber);
    const allSkus = products.flatMap((product) => product.variants.map((v) => v.sku));

    const [existingProducts, existingVariants, categories, brands] = await Promise.all([
      prisma.product.findMany({
        where: { sku: { in: [...articleNumbers, ...allSkus] } },
        select: { id: true, sku: true, name: true },
      }),
      prisma.productVariant.findMany({
        where: { sku: { in: allSkus } },
        select: { sku: true, productId: true },
      }),
      prisma.category.findMany({ select: { id: true, name: true, slug: true } }),
      prisma.brand.findMany({ select: { id: true, name: true, slug: true } }),
    ]);

    const key = (value: string) => value.trim().toLowerCase();
    const productBySku = new Map(existingProducts.map((p) => [key(p.sku), p]));
    const productIdByVariantSku = new Map(existingVariants.map((v) => [key(v.sku), v.productId]));
    const categoryNames = new Set(
      categories.flatMap((c) => [key(c.name), key(c.slug)])
    );
    const brandNames = new Set(brands.flatMap((b) => [key(b.name), key(b.slug)]));

    const reviewed: ReviewProduct[] = products.map((product) => {
      // A product this sheet describes may already be here under its article
      // number, or be recognisable from any one of its size SKUs — which is how
      // a re-import after a rename still updates rather than duplicating.
      const bySku = productBySku.get(key(product.articleNumber));
      const byVariant = product.variants
        .map((variant) => productIdByVariantSku.get(key(variant.sku)))
        .find(Boolean);
      const existingId = bySku?.id ?? byVariant ?? null;

      return {
        ...product,
        action: existingId ? 'update' : 'create',
        existingId,
        newCategory: Boolean(product.category) && !categoryNames.has(key(product.category!)),
        newBrand: Boolean(product.brand) && !brandNames.has(key(product.brand!)),
        sizeChart: sizeChartFrom(product.variants),
        missingForLive: missingForLiveOf(product),
      };
    });

    const rowIssues = rows.filter((row) => row.issues.length > 0);

    res.json({
      success: true,
      message: `${reviewed.length} product(s) across ${rows.length} row(s)`,
      data: {
        sheets,
        products: reviewed,
        rejectedRows: rowIssues.map((row) => ({
          row: row.rowNumber,
          sheet: row.sheet,
          file: row.file,
          issues: row.issues,
        })),
        // Everything the mapping control can offer for an unrecognised column.
        fields: CANONICAL_FIELDS,
        summary: {
          products: reviewed.length,
          variants: reviewed.reduce((sum, p) => sum + p.variants.length, 0),
          creating: reviewed.filter((p) => p.action === 'create').length,
          updating: reviewed.filter((p) => p.action === 'update').length,
          newCategories: [...new Set(reviewed.filter((p) => p.newCategory).map((p) => p.category!))],
          newBrands: [...new Set(reviewed.filter((p) => p.newBrand).map((p) => p.brand!))],
          warnings: reviewed.reduce((sum, p) => sum + p.issues.length, 0),
          rejectedRows: rowIssues.length,
          incomplete: reviewed.filter((p) => p.missingForLive.length > 0).length,
        },
      },
    });
  } catch (error) {
    if (error instanceof Error && /Only \.xlsx/.test(error.message)) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    console.error('[IMPORT] review failed:', error);
    res.status(500).json({ success: false, message: 'That file could not be read' });
  }
});

/** A product as the review screen sends it back, after any edits. */
interface CommitProduct extends NormalisedProduct {
  existingId?: string | null;
  sizeChart?: string;
  /** Left out of the commit when the operator unticks it. */
  skip?: boolean;
}

/**
 * @route POST /admin/catalog-import/commit
 * @description Write the reviewed products, creating what they refer to
 * @access Admin only
 *
 * Categories, brands and colours named by the sheet are created here rather
 * than demanded in advance. That is the whole difference between an importer a
 * seller can use and one they give up on: a listing for a kind of garment the
 * shop has not sold before should not require an admin to go and make a
 * category first, then come back and start again.
 *
 * Each product commits in its own transaction. One bad row out of four hundred
 * leaves the other 399 listed, and is reported by SKU at the end.
 */
router.post('/commit', async (req: AuthRequest, res: Response) => {
  try {
    const products: CommitProduct[] = Array.isArray(req.body?.products) ? req.body.products : [];
    if (products.length === 0) {
      res.status(400).json({ success: false, message: 'Nothing to import' });
      return;
    }

    const vendorId = typeof req.body?.vendorId === 'string' && req.body.vendorId
      ? req.body.vendorId
      : null;
    if (vendorId) {
      const shop = await prisma.vendorProfile.findUnique({
        where: { id: vendorId },
        select: { id: true },
      });
      if (!shop) {
        res.status(400).json({ success: false, message: 'That seller does not exist' });
        return;
      }
    }

    // Publishing straight from a sheet is opt-in: a catalogue import usually
    // needs photographs adding before anything should be visible.
    const publish = req.body?.publish === true;

    const [categories, brands] = await Promise.all([
      prisma.category.findMany({ select: { id: true, name: true, slug: true } }),
      prisma.brand.findMany({ select: { id: true, name: true, slug: true } }),
    ]);
    const key = (value: string) => value.trim().toLowerCase();
    const categoryIds = new Map<string, string>();
    for (const category of categories) {
      categoryIds.set(key(category.name), category.id);
      categoryIds.set(key(category.slug), category.id);
    }
    const brandIds = new Map<string, string>();
    for (const brand of brands) {
      brandIds.set(key(brand.name), brand.id);
      brandIds.set(key(brand.slug), brand.id);
    }

    /** The category to file a product under, creating it when it is new. */
    const resolveCategory = async (name: string): Promise<string> => {
      const found = categoryIds.get(key(name));
      if (found) return found;
      const created = await prisma.category.upsert({
        where: { slug: slugify(name) },
        update: {},
        create: { name: titleCase(name), slug: slugify(name) },
        select: { id: true },
      });
      categoryIds.set(key(name), created.id);
      return created.id;
    };

    const resolveBrand = async (name: string): Promise<string> => {
      const found = brandIds.get(key(name));
      if (found) return found;
      const created = await prisma.brand.upsert({
        where: { slug: slugify(name) },
        update: {},
        create: { name: name.trim(), slug: slugify(name) },
        select: { id: true },
      });
      brandIds.set(key(name), created.id);
      return created.id;
    };

    let created = 0;
    let updated = 0;
    let variantsWritten = 0;
    const createdCategories: string[] = [];
    const failures: Array<{ sku: string; message: string }> = [];
    const incomplete: Array<{ sku: string; missing: string[] }> = [];

    for (const product of products) {
      if (product.skip) continue;
      try {
        if (!product.category) {
          failures.push({ sku: product.articleNumber, message: 'No category chosen' });
          continue;
        }

        const before = categoryIds.size;
        const categoryId = await resolveCategory(product.category);
        if (categoryIds.size > before) createdCategories.push(titleCase(product.category));
        const brandId = product.brand ? await resolveBrand(product.brand) : null;

        // Re-checked here rather than trusted from the browser: the review
        // payload round-trips through the client and may have been edited.
        const articleType = product.articleType ?? null;
        const listing = articleType
          ? sanitiseListing(articleType, product.listing ?? {}, product.attributes ?? {})
          : sanitiseListing(null, product.listing ?? {});
        const variants = product.variants.map((variant) => ({
          ...variant,
          ...sanitiseVariantListing({
            standardSize: variant.standardSize,
            sizeOnLabel: variant.sizeOnLabel,
            gtin: variant.gtin,
            measurements: variant.measurementValues,
          }),
        }));
        const imageAngles: Record<string, string> = {};
        for (const angle of IMAGE_ANGLE_ORDER) {
          const url = product.imageAngles?.[angle];
          if (typeof url === 'string' && url.trim()) imageAngles[angle] = url.trim();
        }
        const angled = IMAGE_ANGLE_ORDER.map((angle) => imageAngles[angle]).filter(Boolean);
        const images = angled.length ? angled : product.images ?? [];

        // Only a complete listing may go live; the rest land as drafts and
        // are reported with what they still need.
        // The category's own required fields count too, same as the form.
        const extraColumns = await categoryColumns(categoryId);
        const missing = missingForLiveOf(
          {
            ...product,
            articleType,
            listing: listing.product,
            attributes: articleType ? listing.attributes : product.attributes,
            imageAngles,
            variants,
          },
          extraColumns
        );

        await prisma.$transaction(async (tx) => {
          // The colour is part of the product's identity here, because one
          // article per colourway is how they are sold and photographed.
          // A template keeps its display and list-view names in their own
          // columns, so the article name stays the title and exports back as is.
          const name = articleType ? product.name : product.displayName || product.name;
          // A template's attributes are stored as data and shown as a spec
          // table; only a sheet without an article type folds them into text.
          const description = articleType
            ? product.description ?? ''
            : [
                product.description,
                Object.entries(product.attributes ?? {})
                  .map(([label, value]) => `${label}: ${value}`)
                  .join('\n'),
              ]
                .filter(Boolean)
                .join('\n\n');

          const fields = {
            name,
            shortDescription: product.shortDescription ?? null,
            description: description || null,
            price: product.price,
            originalPrice: product.mrp && product.mrp > product.price ? product.mrp : null,
            material: product.material ?? (articleType ? listing.attributes.fabric : undefined) ?? null,
            color: product.colorName,
            sizeGuide: product.sizeChart || sizeChartFrom(variants) || null,
            metaTitle: product.metaTitle ?? null,
            metaDescription: product.metaDescription ?? null,
            metaKeywords: product.searchKeywords ?? null,
            categoryId,
            brandId,
            vendorId,
            images,
            thumbnail: imageAngles.front ?? images[0] ?? null,
            // Stock lives on the sizes; the product total is their sum so the
            // listing card and the "in stock" badge agree with the picker.
            quantity: variants.reduce((sum, variant) => sum + variant.stock, 0),
            ...(listing.product as Prisma.ProductUncheckedUpdateInput),
            ...(articleType
              ? {
                  articleType,
                  attributes: listing.attributes as Prisma.InputJsonValue,
                  imageAngles: Object.keys(imageAngles).length
                    ? (imageAngles as Prisma.InputJsonValue)
                    : Prisma.DbNull,
                }
              : {}),
          };

          let productId = product.existingId ?? null;
          if (productId) {
            await tx.product.update({ where: { id: productId }, data: fields });
            updated += 1;
          } else {
            const live = publish && missing.length === 0;
            const made = await tx.product.create({
              data: {
                ...(fields as Prisma.ProductUncheckedCreateInput),
                sku: product.articleNumber,
                slug: await uniqueSlug(tx, slugify(`${name} ${product.colorName}`)),
                status: live ? 'ACTIVE' : 'DRAFT',
              },
              select: { id: true },
            });
            productId = made.id;
            created += 1;
          }

          for (const variant of variants) {
            const perSize = {
              productId,
              name: `${product.colorName} - ${variant.size}`,
              color: product.colorName,
              size: variant.size,
              quantity: variant.stock,
              price: variant.price,
            };
            // A re-import fills in what the sheet carries and never blanks
            // what was added since (a GTIN typed in after the first import).
            const listed: Prisma.ProductVariantUncheckedUpdateInput = {};
            if (variant.standardSize) listed.standardSize = variant.standardSize;
            if (typeof variant.sizeOnLabel === 'boolean') listed.sizeOnLabel = variant.sizeOnLabel;
            if (variant.gtin) listed.gtin = variant.gtin;
            if (variant.measurementValues) {
              const stored = await tx.productVariant.findUnique({
                where: { sku: variant.sku },
                select: { measurements: true },
              });
              const before =
                stored?.measurements && typeof stored.measurements === 'object' && !Array.isArray(stored.measurements)
                  ? (stored.measurements as Record<string, number>)
                  : {};
              listed.measurements = { ...before, ...variant.measurementValues } as Prisma.InputJsonValue;
            }
            await tx.productVariant.upsert({
              where: { sku: variant.sku },
              update: { ...perSize, ...listed },
              create: {
                ...perSize,
                ...(listed as Omit<Prisma.ProductVariantUncheckedCreateInput, 'sku' | 'productId' | 'name'>),
                sku: variant.sku,
              },
            });
            variantsWritten += 1;
          }

          // Report against what is now stored: an update keeps values added
          // since the first import, so the sheet alone would over-report.
          let stillMissing = missing;
          if (product.existingId && articleType) {
            const stored = await tx.product.findUnique({
              where: { id: productId },
              include: { variants: true },
            });
            if (stored) stillMissing = missingForLive(stored as unknown as ListingSnapshot, extraColumns);
          }
          if (stillMissing.length > 0) {
            incomplete.push({ sku: product.articleNumber, missing: stillMissing.map((m) => m.label) });
          }
        });
      } catch (error) {
        failures.push({
          sku: product.articleNumber,
          message:
            error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
              ? 'A product or SKU with this code already exists'
              : error instanceof Error
                ? error.message
                : 'Could not be saved',
        });
      }
    }

    void revalidateCatalog('products');
    if (createdCategories.length > 0) void revalidateCatalog('brands');

    res.json({
      success: true,
      message: `Listed ${created} new and ${updated} updated product(s), ${variantsWritten} size(s)`,
      data: {
        created,
        updated,
        variants: variantsWritten,
        createdCategories: [...new Set(createdCategories)],
        failures,
        // Saved, but kept as drafts: the template fields each still needs.
        incomplete,
      },
    });
  } catch (error) {
    console.error('[IMPORT] commit failed:', error);
    res.status(500).json({ success: false, message: 'Could not list those products' });
  }
});

/**
 * A slug nothing else is using.
 *
 * Two colourways of one style produce the same slug from their shared name, and
 * the column is unique — so the colour is already in the name, and this only
 * has to break the rarer tie of two genuinely identical names.
 */
async function uniqueSlug(tx: Prisma.TransactionClient, base: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await tx.product.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export default router;
