import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isValidEmail } from '@/utils/helpers';

const router = Router();

// @route   POST /api/newsletter
// @desc    Subscribe an email address to the newsletter
// @access  Public
//
// Idempotent: re-subscribing an address that is already on the list answers
// success rather than a conflict, so the endpoint cannot be used to enumerate
// who has already signed up.
router.post('/', async (req: Request, res: Response) => {
  try {
    const email = String((req.body ?? {}).email ?? '').trim().toLowerCase();
    if (!isValidEmail(email) || email.length > 254) {
      res.status(400).json({ success: false, message: 'Enter a valid email address.' });
      return;
    }
    const source = String((req.body ?? {}).source ?? 'footer').slice(0, 40);

    await prisma.newsletterSubscriber.upsert({
      where: { email },
      // Re-subscribing revives a previously unsubscribed address; the original
      // source is kept so the first touchpoint stays attributable.
      update: { isSubscribed: true, unsubscribedAt: null },
      create: { email, source },
    });

    res.status(201).json({ success: true, message: "You're on the list." });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(201).json({ success: true, message: "You're on the list." });
      return;
    }
    console.error('[NEWSLETTER] subscribe failed:', error);
    res.status(500).json({ success: false, message: 'Could not subscribe you right now. Please try again.' });
  }
});

export default router;
