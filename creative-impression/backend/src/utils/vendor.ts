import { BusinessType, Prisma, SellerApplicationStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { HttpError } from '@/utils/helpers';

/**
 * Who owns a product, and who is allowed to change it.
 *
 * The catalogue is multi-seller: `Product.vendorId` says which shop a listing
 * belongs to. Until now nothing set it and nothing checked it, so every
 * product was ownerless and the `VENDOR` role could edit the whole catalogue —
 * including other sellers' listings. Both halves live here so the rule is
 * stated once.
 */

export interface Actor {
  userId: string;
  role?: string;
}

type SellerStanding = {
  id: string;
  isActive: boolean;
  isVerified: boolean;
  applicationStatus: SellerApplicationStatus;
  applicationNote: string | null;
};

/** The seller profile attached to a user, if they have one. */
export async function vendorProfileFor(userId: string): Promise<SellerStanding | null> {
  return prisma.vendorProfile.findUnique({
    where: { userId },
    select: { id: true, isActive: true, isVerified: true, applicationStatus: true, applicationNote: true },
  });
}

/**
 * Why this shop may not list or change products yet, or null when it may.
 *
 * Applying creates the shop straight away so the seller can fill in bank and
 * identity details, but the catalogue stays closed to them until the owner has
 * approved the application. Each answer says what happens next, so a refused
 * seller is not left guessing whether something is broken.
 */
export function sellingBlockedReason(profile: {
  isActive: boolean;
  applicationStatus: SellerApplicationStatus | string;
  applicationNote?: string | null;
}): string | null {
  if (!profile.isActive) return 'This seller account is not active';
  switch (profile.applicationStatus) {
    case 'APPROVED':
      return null;
    case 'APPLIED':
    case 'UNDER_REVIEW':
      return 'Your seller application is still being reviewed. You can list products once it is approved — meanwhile, add your bank and identity details under Settings.';
    case 'REJECTED':
      return `Your seller application was not approved${profile.applicationNote ? `: ${profile.applicationNote}` : ''}. Update your details and contact us to be reconsidered.`;
    case 'SUSPENDED':
      return `Your shop is suspended${profile.applicationNote ? `: ${profile.applicationNote}` : ''}. Contact us to have it reinstated.`;
    default:
      return 'Your seller application has not been approved yet';
  }
}

/**
 * The vendor a newly created product belongs to.
 *
 * A seller's listing is always attributed to that seller — the id is taken
 * from the session, never from the request body, so one shop cannot create a
 * listing under another's name. An admin may name a vendor explicitly (that is
 * how a listing gets moved or seeded on a seller's behalf) and otherwise
 * creates house stock, which has no vendor at all.
 */
export async function resolveOwnerForCreate(
  actor: Actor,
  requestedVendorId: unknown
): Promise<string | null> {
  if (actor.role === 'ADMIN') {
    if (typeof requestedVendorId !== 'string' || requestedVendorId.trim() === '') return null;
    const exists = await prisma.vendorProfile.findUnique({
      where: { id: requestedVendorId.trim() },
      select: { id: true },
    });
    if (!exists) throw new HttpError(400, 'vendorId does not match an existing seller');
    return exists.id;
  }

  const profile = await vendorProfileFor(actor.userId);
  if (!profile) {
    throw new HttpError(403, 'Set up your seller profile before listing products');
  }
  const blocked = sellingBlockedReason(profile);
  if (blocked) throw new HttpError(403, blocked);
  return profile.id;
}

/**
 * Throws unless the actor may modify this product.
 *
 * Answering 404 rather than 403 for another seller's product is deliberate: a
 * 403 confirms the id exists, which lets one seller enumerate another's
 * catalogue by probing ids.
 */
export async function assertCanModifyProduct(actor: Actor, productId: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, vendorId: true },
  });
  if (!product) throw new HttpError(404, 'Product not found');

  if (actor.role === 'ADMIN') return;

  const profile = await vendorProfileFor(actor.userId);
  if (!profile || product.vendorId !== profile.id) {
    throw new HttpError(404, 'Product not found');
  }
  // Their own listing, but a shop that is not (or no longer) approved cannot
  // change what the storefront would show.
  const blocked = sellingBlockedReason(profile);
  if (blocked) throw new HttpError(403, blocked);
}

/**
 * A unique shop slug derived from the name a shop trades under.
 *
 * Shared by both onboarding paths — a seller applying for themselves and an
 * admin creating a shop on their behalf — so two shops with the same name can
 * never collide on the storefront URL whichever way they arrived.
 */
export async function uniqueShopSlug(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'shop';

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await prisma.vendorProfile.findUnique({
      where: { shopSlug: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  // Effectively unreachable; a timestamp is still better than a 500.
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * A product slug no other listing is using.
 *
 * Slugs are platform-wide because they are the product URL, but sellers pick
 * them independently. A clash gets `-2`, `-3` and so on rather than a 409
 * that tells one seller another shop already sells a "cotton-kurta".
 */
export async function uniqueProductSlug(requested: string): Promise<string> {
  const base =
    requested
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/[\s-]+/g, '-')
      .slice(0, 80) || 'product';

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await prisma.product.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export interface DuplicateConflict {
  message: string;
  /** The listing that holds the article number, when the caller may open it. */
  conflict?: { id: string; name: string; status: string };
}

/**
 * What to tell someone whose save hit a unique article number or slug.
 *
 * "A product with this slug or SKU already exists" left them guessing — most
 * often the clash is with a listing they deleted, which is only discontinued
 * and keeps its article number. They are told which listing it is and how to
 * get it back. Another shop's listing is never named.
 */
export async function describeDuplicate(
  target: unknown,
  sku: unknown,
  caller: { userId?: string; role?: string }
): Promise<DuplicateConflict> {
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  if (fields.some((f) => f.includes('slug')) && !fields.some((f) => f.includes('sku'))) {
    return { message: 'That URL slug is already used by another listing. Change the slug and save again.' };
  }
  const code = typeof sku === 'string' ? sku.trim() : '';
  const holder = code
    ? await prisma.product.findFirst({
        where: { sku: { equals: code, mode: 'insensitive' } },
        select: { id: true, name: true, status: true, vendor: { select: { userId: true } } },
      })
    : null;
  const mayOpen = holder && (caller.role === 'ADMIN' || holder.vendor?.userId === caller.userId);
  if (!holder || !mayOpen) {
    return {
      message: `Article number ${code || ''} is already used on the marketplace. Article numbers are unique across every shop — add your shop code to make it yours.`.replace('  ', ' '),
    };
  }
  const conflict = { id: holder.id, name: holder.name, status: holder.status };
  if (holder.status === 'DISCONTINUED') {
    return {
      message: `Article number ${code} belongs to “${holder.name}”, which was deleted. Deleted listings keep their article number — open it and set its status back to Draft to list it again.`,
      conflict,
    };
  }
  return { message: `Article number ${code} is already used by your listing “${holder.name}”.`, conflict };
}

export const BUSINESS_TYPES = Object.values(BusinessType);

/**
 * Validates the business behind a shop: legal name, constitution, registered
 * address and who to contact.
 *
 * Shared by the seller's own application, the seller editing it later, and an
 * admin registering a business on someone's behalf, so all three accept and
 * refuse exactly the same input. With `required`, every field must be present
 * (applying); without, only the fields sent are checked (editing).
 */
export function pickCompanyFields(
  body: Record<string, unknown>,
  { required }: { required: boolean }
): { data: Prisma.VendorProfileUpdateInput; errors: string[] } {
  const data: Prisma.VendorProfileUpdateInput = {};
  const errors: string[] = [];
  const has = (key: string) => body[key] !== undefined && body[key] !== null && body[key] !== '';

  if (has('legalName')) {
    if (typeof body.legalName !== 'string' || body.legalName.trim().length < 2) {
      errors.push('Legal name must be at least 2 characters');
    } else data.legalName = body.legalName.trim().replace(/\s+/g, ' ').slice(0, 160);
  } else if (required) errors.push('Legal name of the business is required');

  if (has('businessType')) {
    if (!BUSINESS_TYPES.includes(body.businessType as BusinessType)) {
      errors.push(`Business type must be one of ${BUSINESS_TYPES.join(', ')}`);
    } else data.businessType = body.businessType as BusinessType;
  } else if (required) errors.push('Business type is required');

  if (has('registeredAddress')) {
    const raw = body.registeredAddress;
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push('Registered address must be an object');
    } else {
      const a = raw as Record<string, unknown>;
      const text = (key: string, max = 160) =>
        typeof a[key] === 'string' ? (a[key] as string).trim().replace(/\s+/g, ' ').slice(0, max) : '';
      const address = {
        line1: text('line1'),
        line2: text('line2') || undefined,
        city: text('city', 80),
        state: text('state', 80),
        pincode: text('pincode', 10).replace(/\s+/g, ''),
        country: text('country', 60) || 'India',
      };
      if (!address.line1) errors.push('Address line 1 is required');
      if (!address.city) errors.push('City is required');
      if (!address.state) errors.push('State is required');
      if (!/^[1-9]\d{5}$/.test(address.pincode)) errors.push('Pincode must be 6 digits');
      data.registeredAddress = address;
    }
  } else if (required) errors.push('Registered address is required');

  if (has('contactPhone')) {
    // Accepts "+91 98765 43210", "098765-43210" and so on; stores the 10 digits.
    const digits = String(body.contactPhone).replace(/[\s()-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
    if (!/^[6-9]\d{9}$/.test(digits)) errors.push('Contact phone must be a 10-digit Indian mobile number');
    else data.contactPhone = digits;
  } else if (required) errors.push('Contact phone is required');

  if (has('contactEmail')) {
    const email = String(body.contactEmail).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
      errors.push('Contact email is not a valid email address');
    } else data.contactEmail = email;
  } else if (required) errors.push('Contact email is required');

  return { data, errors };
}
