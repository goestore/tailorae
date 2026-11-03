import { Router, Response } from 'express';
import { prisma } from '@/lib/prisma';
import { isNonEmptyString } from '@/utils/helpers';

const router = Router();

// @route   POST /api/contact
// @desc    Store a storefront contact request for the admin team
// @access  Public
router.post('/', async (req, res: Response) => {
  try {
    const { name, email, subject, message } = (req.body ?? {}) as Record<string, unknown>;

    if (![name, email, subject, message].every(isNonEmptyString)) {
      res.status(400).json({ success: false, message: 'Name, email, subject, and message are required.' });
      return;
    }
    // every() validates the values at runtime; use the narrowed local values
    // below so TypeScript also knows they are strings.
    const cleanName = name as string;
    const cleanSubject = subject as string;
    const cleanMessage = message as string;
    const cleanEmail = (email as string).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      res.status(400).json({ success: false, message: 'Enter a valid email address.' });
      return;
    }

    const request = await prisma.contactRequest.create({
      data: {
        name: cleanName.trim().slice(0, 120),
        email: cleanEmail.slice(0, 254),
        subject: cleanSubject.trim().slice(0, 180),
        message: cleanMessage.trim().slice(0, 5000),
      },
    });

    res.status(201).json({ success: true, message: 'Message received.', data: { request } });
  } catch (error) {
    console.error('[Contact] create request failed:', error);
    res.status(500).json({ success: false, message: 'Could not send your message. Please try again.' });
  }
});

export default router;
