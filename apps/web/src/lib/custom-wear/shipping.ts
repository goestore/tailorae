/**
 * Delivery estimation.
 *
 * The rule table below is a placeholder for the shipping service. No city or
 * postcode is hardcoded into a component — everything is derived here, so
 * pointing `estimateDelivery` at a real endpoint is the only change needed
 * when shipping rules move to the backend.
 */

import type { DeliveryEstimate, DeliveryOption } from '@/types/custom-wear';

export interface ShippingZoneRule {
  id: string;
  label: string;
  /** Matches the first character of the normalised postcode. */
  prefixes: string[];
  standard: { minDays: number; maxDays: number; cost: number };
  express: { minDays: number; maxDays: number; cost: number; available: boolean };
}

/** Replace wholesale when the shipping API lands. */
export const SHIPPING_ZONE_RULES: ShippingZoneRule[] = [
  {
    id: 'zone-a',
    label: 'Metro network',
    prefixes: ['1', '4', '5'],
    standard: { minDays: 3, maxDays: 5, cost: 0 },
    express: { minDays: 1, maxDays: 2, cost: 249, available: true },
  },
  {
    id: 'zone-b',
    label: 'Regional network',
    prefixes: ['2', '3', '6'],
    standard: { minDays: 4, maxDays: 7, cost: 99 },
    express: { minDays: 2, maxDays: 3, cost: 349, available: true },
  },
  {
    id: 'zone-c',
    label: 'Extended network',
    prefixes: ['7', '8', '9', '0'],
    standard: { minDays: 6, maxDays: 9, cost: 149 },
    express: { minDays: 3, maxDays: 5, cost: 449, available: false },
  },
];

export const FREE_SHIPPING_ABOVE = 4999;

export class PostcodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PostcodeError';
  }
}

export function normalisePostcode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

/** Accepts a 6-digit Indian PIN or a 3–10 character international ZIP. */
export function isValidPostcode(input: string): boolean {
  const value = normalisePostcode(input);
  if (/^\d{6}$/.test(value)) return true;
  return /^[A-Z0-9-]{3,10}$/.test(value);
}

function resolveZone(postcode: string): ShippingZoneRule {
  const firstDigit = postcode.replace(/\D/g, '').charAt(0);
  return (
    SHIPPING_ZONE_RULES.find((zone) => zone.prefixes.includes(firstDigit)) ??
    SHIPPING_ZONE_RULES[SHIPPING_ZONE_RULES.length - 1]
  );
}

export interface EstimateOptions {
  /** Order value, used for the free-shipping threshold. */
  orderValue?: number;
  currency?: string;
}

/**
 * Resolves delivery options for a postcode.
 *
 * Async on purpose: the signature already matches the eventual
 * `GET /api/shipping/estimate` call, so swapping the body for a fetch will not
 * ripple into the components.
 */
export async function estimateDelivery(
  rawPostcode: string,
  { orderValue = 0, currency = 'INR' }: EstimateOptions = {}
): Promise<DeliveryEstimate> {
  const postcode = normalisePostcode(rawPostcode);

  if (!isValidPostcode(postcode)) {
    throw new PostcodeError('Enter a valid 6-digit PIN or international ZIP code.');
  }

  const zone = resolveZone(postcode);
  const qualifiesForFree = orderValue >= FREE_SHIPPING_ABOVE;

  const options: DeliveryOption[] = [
    {
      id: 'standard',
      label: 'Standard Delivery',
      minDays: zone.standard.minDays,
      maxDays: zone.standard.maxDays,
      cost: qualifiesForFree ? 0 : zone.standard.cost,
      freeAbove: FREE_SHIPPING_ABOVE,
      available: true,
      note: qualifiesForFree
        ? 'Free shipping applied to this order value.'
        : zone.standard.cost === 0
          ? 'Free on this route.'
          : undefined,
    },
    {
      id: 'express',
      label: 'Express Delivery',
      minDays: zone.express.minDays,
      maxDays: zone.express.maxDays,
      cost: zone.express.cost,
      available: zone.express.available,
      note: zone.express.available
        ? 'Dispatched on approval of your digital proof.'
        : 'Not serviceable on this route yet.',
    },
  ];

  return { postcode, zoneLabel: zone.label, options, currency };
}

/** Business-day arrival window, e.g. "Tue, 25 Aug – Thu, 27 Aug". */
export function formatDeliveryWindow(option: DeliveryOption, from: Date = new Date()): string {
  const addBusinessDays = (start: Date, days: number): Date => {
    const date = new Date(start);
    let remaining = days;
    while (remaining > 0) {
      date.setDate(date.getDate() + 1);
      const day = date.getDay();
      if (day !== 0 && day !== 6) remaining -= 1;
    }
    return date;
  };

  const format = (date: Date): string =>
    date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  const earliest = addBusinessDays(from, option.minDays);
  const latest = addBusinessDays(from, option.maxDays);

  if (option.minDays === option.maxDays) return format(earliest);
  return `${format(earliest)} – ${format(latest)}`;
}
