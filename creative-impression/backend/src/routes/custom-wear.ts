import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { CustomWearQuote } from '@prisma/client';
import { authMiddleware, optionalAuth, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { sendMail } from '@/services/mailer';
import { isHttpError, isValidEmail } from '@/utils/helpers';
import {
  ARTWORK_MAX_BYTES,
  REFERENCE_RE,
  QuoteContact,
  QuoteItem,
  isUniqueViolation,
  newReference,
  parseContact,
  parseItem,
  storeArtwork,
  withUniqueReference,
} from '@/utils/custom-wear';

/**
 * Custom Wear — public quote requests and artwork uploads.
 *
 * Custom garments are made to order and priced by a person, so nothing here
 * takes payment: a request becomes a `CustomWearQuote` the team works from the
 * admin console (`/api/admin/custom-wear`).
 */

const router = Router();

const WINDOW_MS = 15 * 60 * 1000;

// Public, unauthenticated writes: throttled per IP like the auth routes.
const quoteLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many quote requests from this address. Please try again later.' },
});

const artworkLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many uploads from this address. Please try again later.' },
});

const lookupLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many lookups. Please try again later.' },
});

/** What a customer may see of their own quote: never the internal notes. */
const publicQuote = (quote: CustomWearQuote) => ({
  reference: quote.reference,
  status: quote.status,
  productName: quote.productName,
  productSlug: quote.productSlug,
  sku: quote.sku,
  colorName: quote.colorName,
  sizes: quote.sizes,
  quantity: quote.quantity,
  method: quote.method,
  locations: quote.locations,
  designFiles: quote.designFiles,
  quotedPrice: quote.quotedPrice,
  requiredBy: quote.requiredBy,
  createdAt: quote.createdAt,
  updatedAt: quote.updatedAt,
});

const storefront = (): string =>
  (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

/** Fire-and-forget: a mail failure never fails the request it reports on. */
async function notifyQuotes(contact: QuoteContact, quotes: CustomWearQuote[]): Promise<void> {
  try {
    const lines = quotes
      .map(
        (q) =>
          `${q.reference} — ${q.productName} (${q.sku}) × ${q.quantity}` +
          `${q.colorName ? `, ${q.colorName}` : ''}${q.sizes.length ? `, sizes ${q.sizes.join('/')}` : ''}`
      )
      .join('\n');
    const statusLink = `${storefront()}/custom-wear/quotes?reference=${encodeURIComponent(
      quotes[0].reference
    )}&email=${encodeURIComponent(contact.email)}`;

    await sendMail({
      to: contact.email,
      subject: `We received your custom wear request — ${quotes[0].reference}${quotes.length > 1 ? ` (+${quotes.length - 1})` : ''}`,
      text:
        `Hi ${contact.customerName},\n\n` +
        `Thanks for your custom wear request. Our team will reply with pricing, lead times and a digital proof.\n\n` +
        `${lines}\n\nCheck the status any time: ${statusLink}\n\n— Creative Impression`,
    });

    const storeAddress = process.env.ADMIN_EMAIL?.trim();
    if (storeAddress) {
      const artwork = quotes.flatMap((q) => q.designFiles).length;
      await sendMail({
        to: storeAddress,
        subject: `New custom wear quote request — ${quotes.map((q) => q.reference).join(', ')}`,
        text:
          `${contact.customerName}${contact.company ? ` (${contact.company})` : ''} <${contact.email}>` +
          `${contact.phone ? `, ${contact.phone}` : ''}\n${contact.country}${contact.postcode ? ` ${contact.postcode}` : ''}` +
          `${contact.requiredBy ? `\nNeeded by ${contact.requiredBy}` : ''}\n\n${lines}\n\n` +
          `${artwork} artwork file(s) attached.\nReview: ${storefront()}/admin/custom-wear`,
      });
    }
  } catch (error) {
    console.error('[custom-wear] quote mail failed:', (error as Error).message);
  }
}

const quoteData = (item: QuoteItem, contact: QuoteContact, userId: string | null) => ({
  ...item,
  ...contact,
  userId,
});

// @route   POST /api/custom-wear/quotes
// @desc    Request a quote for one custom garment
// @access  Public (linked to the account when signed in)
router.post('/quotes', quoteLimiter, optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const errors: string[] = [];
    const contact = parseContact(body, errors);
    const item = parseItem(body, errors);
    if (errors.length > 0) {
      res.status(422).json({
        success: false,
        message: 'Some details are missing or invalid. Please check the form and try again.',
        errors,
      });
      return;
    }

    const quote = await withUniqueReference((reference) =>
      prisma.customWearQuote.create({
        data: { reference, ...quoteData(item, contact, req.userId ?? null) },
      })
    );

    void notifyQuotes(contact, [quote]);

    res.status(201).json({
      success: true,
      message: 'Quote request received',
      data: {
        reference: quote.reference,
        references: [quote.reference],
        persisted: true,
        receivedAt: quote.createdAt.toISOString(),
        quote: publicQuote(quote),
      },
    });
  } catch (error) {
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    console.error('[custom-wear] create quote failed:', error);
    res.status(500).json({ success: false, message: 'Could not save your quote request. Please try again.' });
  }
});

// @route   POST /api/custom-wear/quotes/batch
// @desc    Request quotes for several custom garments at once (the cart's
//          custom-wear section). One contact, one quote per line, all or none.
// @access  Public (linked to the account when signed in)
router.post('/quotes/batch', quoteLimiter, optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const errors: string[] = [];
    const contact = parseContact(body, errors);
    const rawItems = body.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 20) {
      errors.push('items must be a list of 1 to 20 garments');
    }
    const items = (Array.isArray(rawItems) ? rawItems : []).map((raw, index) => {
      const itemErrors: string[] = [];
      const item = parseItem(
        typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {},
        itemErrors
      );
      errors.push(...itemErrors.map((message) => `items[${index}]: ${message}`));
      return item;
    });
    if (errors.length > 0) {
      res.status(422).json({
        success: false,
        message: 'Some details are missing or invalid. Please check the form and try again.',
        errors,
      });
      return;
    }

    const userId = req.userId ?? null;
    let quotes: CustomWearQuote[] | null = null;
    // A collision aborts the whole transaction, so the batch is retried with
    // fresh references rather than one row at a time.
    for (let attempt = 0; attempt < 5 && !quotes; attempt += 1) {
      const references = new Set<string>();
      while (references.size < items.length) references.add(newReference());
      const refs = Array.from(references);
      try {
        quotes = await prisma.$transaction(
          items.map((item, index) =>
            prisma.customWearQuote.create({
              data: { reference: refs[index], ...quoteData(item, contact, userId) },
            })
          )
        );
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    if (!quotes) {
      res.status(503).json({ success: false, message: 'Could not issue quote references. Please try again.' });
      return;
    }

    void notifyQuotes(contact, quotes);

    res.status(201).json({
      success: true,
      message: 'Quote requests received',
      data: {
        reference: quotes[0].reference,
        references: quotes.map((q) => q.reference),
        persisted: true,
        receivedAt: quotes[0].createdAt.toISOString(),
        quotes: quotes.map(publicQuote),
      },
    });
  } catch (error) {
    console.error('[custom-wear] batch quote failed:', error);
    res.status(500).json({ success: false, message: 'Could not save your quote requests. Please try again.' });
  }
});

// @route   GET /api/custom-wear/quotes/mine
// @desc    The signed-in customer's quotes, newest first
// @access  Private
router.get('/quotes/mine', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const quotes = await prisma.customWearQuote.findMany({
      // Also quotes sent as a guest with the same address before signing up.
      where: {
        OR: [
          { userId: req.userId! },
          ...(req.user?.email ? [{ userId: null, email: req.user.email.toLowerCase() }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ success: true, data: { quotes: quotes.map(publicQuote) } });
  } catch (error) {
    console.error('[custom-wear] list mine failed:', error);
    res.status(500).json({ success: false, message: 'Could not load your quotes.' });
  }
});

// @route   GET /api/custom-wear/quotes/:reference?email=
// @desc    Guest status check. Answers only when the email matches, and says
//          "not found" either way so references cannot be probed.
// @access  Public
router.get('/quotes/:reference', lookupLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const reference = String(req.params.reference || '').trim().toUpperCase();
    const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';
    if (!REFERENCE_RE.test(reference) || !isValidEmail(email)) {
      res.status(400).json({ success: false, message: 'Enter your quote reference and the email you used.' });
      return;
    }
    const quote = await prisma.customWearQuote.findUnique({ where: { reference } });
    if (!quote || quote.email.toLowerCase() !== email) {
      res.status(404).json({ success: false, message: 'No quote matches that reference and email.' });
      return;
    }
    res.json({ success: true, data: { quote: publicQuote(quote) } });
  } catch (error) {
    console.error('[custom-wear] lookup failed:', error);
    res.status(500).json({ success: false, message: 'Could not look up that quote.' });
  }
});

// ── Artwork ───────────────────────────────────────────────────────────

const artworkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ARTWORK_MAX_BYTES, files: 1 },
});

/** multer reports an oversize file as an error; turn it into a clear 413. */
const singleArtwork = (req: AuthRequest, res: Response, next: NextFunction) => {
  artworkUpload.single('file')(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      const tooBig = error.code === 'LIMIT_FILE_SIZE';
      res.status(tooBig ? 413 : 400).json({
        success: false,
        message: tooBig ? 'Artwork must be 15 MB or smaller.' : 'Upload one file in the "file" field.',
      });
      return;
    }
    if (error) {
      next(error);
      return;
    }
    next();
  });
};

// @route   POST /api/custom-wear/artwork
// @desc    Upload one artwork file (PNG, JPG, WebP, SVG → PNG, or PDF)
// @access  Public
router.post('/artwork', artworkLimiter, singleArtwork, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file was uploaded.' });
      return;
    }
    const stored = await storeArtwork(req.file.buffer);
    res.status(201).json({
      success: true,
      message: 'Artwork uploaded',
      data: {
        artwork: {
          ...stored,
          // A label only; it never touches the stored path.
          name: (req.file.originalname || 'artwork').replace(/[\\/]/g, '_').slice(0, 160),
        },
      },
    });
  } catch (error) {
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    console.error('[custom-wear] artwork upload failed:', error);
    res.status(500).json({ success: false, message: 'Could not upload that file. Please try again.' });
  }
});

export default router;
