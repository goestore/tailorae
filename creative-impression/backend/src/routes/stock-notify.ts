import { Router, Request, Response } from 'express';
import { prisma } from '@/lib/prisma';
import { isNonEmptyString, isValidEmail } from '@/utils/helpers';

const router = Router();

// @route   POST /api/stock-notify
// @desc    Register interest in a product (or size) that is out of stock
// @access  Public
router.post('/', async (req: Request, res: Response) => {
  try {
    const { productId, variantId } = (req.body ?? {}) as Record<string, unknown>;
    const email = String((req.body ?? {}).email ?? '').trim().toLowerCase();

    if (!isNonEmptyString(productId)) {
      res.status(400).json({ success: false, message: 'productId is required' });
      return;
    }
    if (!isValidEmail(email) || email.length > 254) {
      res.status(400).json({ success: false, message: 'Enter a valid email address.' });
      return;
    }
    if (variantId !== undefined && variantId !== null && !isNonEmptyString(variantId)) {
      res.status(400).json({ success: false, message: 'variantId must be a string' });
      return;
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    const variant = isNonEmptyString(variantId) ? variantId : null;
    if (variant) {
      const exists = await prisma.productVariant.findFirst({
        where: { id: variant, productId },
        select: { id: true },
      });
      if (!exists) {
        res.status(404).json({ success: false, message: 'Variant not found' });
        return;
      }
    }

    // Postgres treats NULLs as distinct, so the unique index does not catch a
    // repeat product-level signup. Check first and treat a repeat as success —
    // signing up twice is not an error the shopper should see.
    const existing = await prisma.stockNotification.findFirst({
      where: { productId, variantId: variant, email, notifiedAt: null },
      select: { id: true },
    });
    if (!existing) {
      await prisma.stockNotification.create({
        data: { productId, variantId: variant, email },
      });
    }

    res.status(201).json({
      success: true,
      message: "We'll email you when this is back in stock.",
    });
  } catch (error) {
    console.error('[STOCK-NOTIFY] signup failed:', error);
    res.status(500).json({ success: false, message: 'Could not save that request. Please try again.' });
  }
});

export default router;
