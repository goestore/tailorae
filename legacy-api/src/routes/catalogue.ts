import { Router, Response } from 'express';
import { authMiddleware, roleMiddleware, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getArticleSpec, listArticleTypes } from '@/utils/product-spec';
import { categoryExtras } from '@/utils/category-fields';

/**
 * The listing catalogue, for the product form.
 *
 * Admins and sellers both list products, so both can read it. It is the same
 * catalogue the server validates against, so the form never offers an option
 * the save would refuse.
 */
const router = Router();
const canList = roleMiddleware(['ADMIN', 'VENDOR']);

// @route   GET /api/catalogue/article-types
router.get('/article-types', authMiddleware, canList, (_req: AuthRequest, res: Response) => {
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.json({ success: true, data: { articleTypes: listArticleTypes() } });
});

// @route   GET /api/catalogue/article-types/:type?categoryId=
// @desc    The template, and with `categoryId` the fields the admin defined on
//          that category and its ancestors merged into its attributes, plus
//          the category's variant option name and suggested values.
router.get('/article-types/:type', authMiddleware, canList, async (req: AuthRequest, res: Response) => {
  try {
    const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : null;
    const spec = getArticleSpec(req.params.type, categoryId ? await categoryExtras(categoryId) : null);
    if (!spec) {
      res.status(404).json({ success: false, message: 'Unknown article type' });
      return;
    }
    // The template never changes while the server runs; a category's fields
    // change whenever the admin edits them.
    res.setHeader('Cache-Control', categoryId ? 'private, no-cache' : 'private, max-age=300');
    res.json({ success: true, data: { spec } });
  } catch (error) {
    console.error('[CATALOGUE] article type failed:', error);
    res.status(500).json({ success: false, message: 'Could not load that article type' });
  }
});

// @route   GET /api/catalogue/last-business-details
// @desc    Manufacturer/packer/importer and origin from the caller's most
//          recent listing, so a seller does not retype their address every time.
router.get('/last-business-details', authMiddleware, canList, async (req: AuthRequest, res: Response) => {
  try {
    const where =
      req.user?.role === 'ADMIN'
        ? { manufacturerDetails: { not: null } }
        : { manufacturerDetails: { not: null }, vendor: { is: { userId: req.userId! } } };
    const last = await prisma.product.findFirst({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        manufacturerDetails: true,
        packerDetails: true,
        importerDetails: true,
        countriesOfOrigin: true,
        brandId: true,
        hsn: true,
      },
    });
    res.json({ success: true, data: { details: last } });
  } catch (error) {
    console.error('[CATALOGUE] last details failed:', error);
    res.status(500).json({ success: false, message: 'Could not load your last listing details' });
  }
});

/** The caller's own shop, if they have one. */
const callerShopId = async (userId: string | undefined): Promise<string | null> =>
  userId
    ? ((await prisma.vendorProfile.findFirst({ where: { userId }, select: { id: true } }))?.id ?? null)
    : null;

// @route   GET /api/catalogue/brands
// @desc    Every brand, for the listing form's Brand field.
//          `isActive` controls whether a brand gets a page on the storefront,
//          not whether a product may carry it, so inactive brands are listed
//          too. The public brand list only shows brands with live products,
//          which left a seller with a new brand unable to fill a required field.
//          A seller sees approved brands and the ones their own shop added;
//          another shop's brand that is still waiting for approval is not
//          theirs to list under, and its name is not theirs to see.
router.get('/brands', authMiddleware, canList, async (req: AuthRequest, res: Response) => {
  try {
    const shopId = req.user?.role === 'ADMIN' ? null : await callerShopId(req.userId);
    const brands = await prisma.brand.findMany({
      where:
        req.user?.role === 'ADMIN'
          ? {}
          : {
              OR: [
                { isActive: true },
                // A brand the admin turned down is no longer offered to its shop.
                ...(shopId ? [{ ownerVendorId: shopId, status: { not: 'REJECTED' as const } }] : []),
              ],
            },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, isActive: true },
    });
    res.json({ success: true, data: { brands } });
  } catch (error) {
    console.error('[CATALOGUE] brands failed:', error);
    res.status(500).json({ success: false, message: 'Could not load brands' });
  }
});

// @route   POST /api/catalogue/brands
// @desc    Add a brand from the listing form.
//          A Myntra listing carries the seller's own brand, so sellers need to
//          be able to add it. A seller-added brand starts without a storefront
//          page (isActive false) until an admin reviews it; it can be put on a
//          listing straight away. An existing brand with the same name is
//          returned instead of a duplicate.
router.post('/brands', authMiddleware, canList, async (req: AuthRequest, res: Response) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
    if (name.length < 2) {
      res.status(400).json({ success: false, message: 'Enter the brand name (at least 2 characters)' });
      return;
    }

    const shopId = req.user?.role === 'ADMIN' ? null : await callerShopId(req.userId);
    const existing = await prisma.brand.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true, name: true, slug: true, isActive: true, ownerVendorId: true },
    });
    if (existing && req.user?.role !== 'ADMIN' && !existing.isActive && existing.ownerVendorId !== shopId) {
      res.status(409).json({
        success: false,
        message: 'Another shop has asked for that brand name and it is waiting for approval. Contact us if the brand is yours.',
      });
      return;
    }
    if (existing) {
      const { ownerVendorId: _owner, ...brand } = existing;
      res.json({ success: true, message: 'That brand already exists', data: { brand, created: false } });
      return;
    }

    const base =
      name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/[\s-]+/g, '-')
        .slice(0, 60) || 'brand';
    let slug = base;
    for (let i = 2; await prisma.brand.findUnique({ where: { slug }, select: { id: true } }); i += 1) {
      slug = `${base}-${i}`;
    }

    const brand = await prisma.brand.create({
      // A seller's brand waits for review like one registered from Brands;
      // the shop can upload its trademark proof there to get it approved.
      data: {
        name,
        slug,
        isActive: req.user?.role === 'ADMIN',
        status: req.user?.role === 'ADMIN' ? 'APPROVED' : 'PENDING',
        ownerVendorId: shopId,
      },
      select: { id: true, name: true, slug: true, isActive: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.userId ?? null,
        action: 'CREATE',
        resource: 'Brand',
        resourceId: brand.id,
        newValue: { name: brand.name, via: 'listing-form' },
        ipAddress: req.ip ?? null,
      },
    });

    res.status(201).json({ success: true, message: 'Brand added', data: { brand, created: true } });
  } catch (error) {
    console.error('[CATALOGUE] add brand failed:', error);
    res.status(500).json({ success: false, message: 'Could not add that brand' });
  }
});

export default router;
