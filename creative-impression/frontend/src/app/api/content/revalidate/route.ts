/**
 * POST /api/content/revalidate
 *
 * Drops the cached copy of one content namespace so a publish becomes visible.
 *
 * `loadContent` caches storefront reads under one tag per namespace and holds
 * them for an hour by default. Without this hook a publish would be correct in
 * the database and invisible on the site until that hour elapsed, which reads
 * as "the admin does nothing". The backend calls this at the end of a
 * successful publish.
 *
 * Authorisation is a shared secret rather than the admin's session, because the
 * caller is the backend rather than a browser. It fails closed: with no secret
 * configured, nothing can revalidate.
 */

import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { contentCacheTag } from '@/content/source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Catalogue caches the backend may drop by name.
 *
 * An allowlist rather than a free-text tag: `revalidateTag` takes any string,
 * and accepting one from a request would let a caller invalidate anything the
 * app ever tags, turning this into a cache-stampede lever.
 */
const CATALOG_TAGS = ['brands', 'sellers', 'products'] as const;

const bodySchema = z
  .object({
    // Matches the namespaces the registry defines: lowercase words and hyphens.
    namespace: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9-]+$/, 'A namespace is lowercase letters, digits and hyphens.')
      .optional(),
    tag: z.enum(CATALOG_TAGS).optional(),
  })
  .refine((body) => Boolean(body.namespace) !== Boolean(body.tag), {
    message: 'Send exactly one of `namespace` or `tag`.',
  });

/** Length-independent comparison, so a wrong secret cannot be timed out character by character. */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: Request) {
  const expected = process.env.CONTENT_REVALIDATE_SECRET;
  if (!expected) {
    // Refusing is the safe failure: an unauthenticated cache-flush endpoint is
    // a denial-of-service lever, and a stale storefront is the lesser fault.
    console.error(
      '[content] CONTENT_REVALIDATE_SECRET is not set — refusing to revalidate. ' +
        'Set it in the frontend and backend environments so publishes go live.'
    );
    return NextResponse.json({ success: false, message: 'Revalidation is not configured.' }, { status: 503 });
  }

  const provided = request.headers.get('x-content-revalidate-secret') ?? '';
  if (!secretMatches(provided, expected)) {
    return NextResponse.json({ success: false, message: 'Not authorised.' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Body must be JSON.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: parsed.error.issues[0]?.message ?? 'Invalid body.' },
      { status: 400 }
    );
  }

  // A catalogue tag is used verbatim; a content namespace is namespaced first.
  const tag = parsed.data.tag ?? contentCacheTag(parsed.data.namespace!);
  // 'max' marks the tag stale rather than expiring it, so the next visitor is
  // served the old copy while the new one is fetched behind them. No request
  // pays for the refresh.
  revalidateTag(tag, 'max');

  return NextResponse.json({ success: true, namespace: parsed.data.namespace ?? null, tag });
}
