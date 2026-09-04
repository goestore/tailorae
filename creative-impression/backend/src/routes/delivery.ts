import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

/**
 * Delivery serviceability and ETA for a 6-digit Indian pincode.
 *
 * There is no courier account wired up on this project yet, so the shape of
 * the answer is deliberately split in two:
 *   - existence is checked against India Post, which is authoritative and free;
 *   - the day range is a zone heuristic and says so (`source: 'estimate'`).
 * When a courier API is added, only `estimateEta` and the `source` value need
 * to change — the callers already read `source` and label the ETA accordingly,
 * so a real quote does not require a frontend change.
 */

const INDIA_POST_URL = 'https://api.postalpincode.in/pincode';

interface PincodeInfo {
  serviceable: boolean;
  city: string;
  district: string;
  state: string;
}

// India has ~19,000 pincodes and this endpoint is public, so an unbounded map
// is a slow leak an anonymous caller can drive. Cap it and evict the oldest
// entry (Map preserves insertion order).
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = Number(process.env.PINCODE_CACHE_MAX || 5000);
const cache = new Map<string, { data: PincodeInfo; expiresAt: number }>();

const readCache = (pin: string): PincodeInfo | null => {
  const entry = cache.get(pin);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(pin);
    return null;
  }
  return entry.data;
};

const writeCache = (pin: string, data: PincodeInfo): void => {
  if (!cache.has(pin)) {
    while (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      cache.delete(oldest.value);
    }
  }
  cache.set(pin, { data, expiresAt: Date.now() + CACHE_TTL_MS });
};

/**
 * First digit of an Indian pincode is a rough zone indicator, which is enough
 * for a "arrives between" range. Zone 8 (the North East) is slower and is the
 * one region we do not offer COD in.
 */
const ZONE_DAYS: Record<string, number> = {
  '1': 4, '2': 4, '3': 3, '4': 3, '5': 4, '6': 4, '7': 5, '8': 6,
};

const estimateEta = (pin: string) => {
  const minDays = ZONE_DAYS[pin[0]] ?? 5;
  return { minDays, maxDays: minDays + 2, cod: pin[0] !== '8' };
};

const formatEtaDate = (daysFromNow: number): string =>
  new Date(Date.now() + daysFromNow * 86_400_000).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

const isPincode = (value: unknown): value is string => /^\d{6}$/.test(String(value));

/** India Post lookup. Returns null when the service could not be reached. */
async function lookupPincode(pin: string): Promise<PincodeInfo | null> {
  try {
    const { data } = await axios.get(`${INDIA_POST_URL}/${pin}`, { timeout: 8000 });
    const entry = Array.isArray(data) ? data[0] : undefined;
    const office = entry?.PostOffice?.[0];
    if (entry?.Status !== 'Success' || !office) {
      // A definite "no such pincode" — not an outage.
      return { serviceable: false, city: '', district: '', state: '' };
    }
    return {
      serviceable: true,
      city: office.Block || office.Name || '',
      district: office.District || '',
      state: office.State || '',
    };
  } catch (error) {
    // Warned rather than swallowed: failing open turns a dead upstream into
    // "every pincode is deliverable", which from the outside looks exactly
    // like a healthy day.
    console.warn(`[DELIVERY] India Post lookup failed for ${pin}:`, (error as Error).message);
    return null;
  }
}

// @route   GET /api/delivery/pincode/:pin
// @desc    Check whether we deliver to a pincode, with its city/state
// @access  Public
router.get('/pincode/:pin', async (req: Request, res: Response) => {
  const pin = req.params.pin;
  if (!isPincode(pin)) {
    res.status(400).json({ success: false, message: 'Enter a valid 6-digit pincode.' });
    return;
  }

  const cached = readCache(pin);
  if (cached) {
    res.json({ success: true, message: 'Pincode checked', data: { pincode: pin, ...cached } });
    return;
  }

  const info = await lookupPincode(pin);
  // Upstream unreachable: answer serviceable rather than turning a lookup
  // outage into a refused order. A wrong "yes" costs one support call; a wrong
  // "no" loses the sale silently.
  const resolved: PincodeInfo = info ?? { serviceable: true, city: '', district: '', state: '' };
  if (info) writeCache(pin, resolved);

  res.json({ success: true, message: 'Pincode checked', data: { pincode: pin, ...resolved } });
});

// @route   POST /api/delivery/eta
// @desc    Estimated delivery window and COD availability for a pincode
// @access  Public
router.post('/eta', async (req: Request, res: Response) => {
  const pincode = String((req.body ?? {}).pincode ?? '').trim();
  if (!isPincode(pincode)) {
    res.status(400).json({ success: false, message: 'Enter a valid 6-digit pincode.' });
    return;
  }

  const info = readCache(pincode) ?? (await lookupPincode(pincode));
  if (info) writeCache(pincode, info);

  if (info && !info.serviceable) {
    res.json({
      success: true,
      message: 'Not serviceable',
      data: { pincode, serviceable: false, source: 'india-post' },
    });
    return;
  }

  const eta = estimateEta(pincode);
  res.json({
    success: true,
    message: 'Delivery estimate',
    data: {
      pincode,
      serviceable: true,
      city: info?.city ?? '',
      state: info?.state ?? '',
      cod: eta.cod,
      minDays: eta.minDays,
      maxDays: eta.maxDays,
      earliest: formatEtaDate(eta.minDays),
      latest: formatEtaDate(eta.maxDays),
      source: 'estimate',
    },
  });
});

export default router;
