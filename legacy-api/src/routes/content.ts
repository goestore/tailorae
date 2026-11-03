import { Router, Request, Response } from 'express';
import { ContentValue, Prisma } from '@prisma/client';
import { authMiddleware, adminOnly, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { HttpError, isHttpError } from '@/utils/helpers';

const router = Router();

/**
 * Tells the storefront to drop its cached copy of a namespace.
 *
 * The frontend caches published content under one tag per namespace, so
 * without this a publish is correct in the database and invisible on the site
 * until the cache expires on its own — which reads as a broken admin.
 *
 * Best effort by design: the values are already committed by the time this
 * runs, so a frontend that is down or slow must not turn a successful publish
 * into a failed request. It is logged loudly instead, and the response says
 * whether it landed.
 */
async function revalidateStorefront(namespace: string): Promise<boolean> {
  const secret = process.env.CONTENT_REVALIDATE_SECRET;
  if (!secret) {
    console.warn(
      `[ADMIN] CONTENT_REVALIDATE_SECRET is not set — published "${namespace}" but the ` +
        'storefront will serve its cached copy until that expires.'
    );
    return false;
  }

  const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

  try {
    // A publish must not hang on an unresponsive frontend.
    const response = await fetch(`${base}/api/content/revalidate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-content-revalidate-secret': secret,
      },
      body: JSON.stringify({ namespace }),
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      console.error(
        `[ADMIN] storefront refused revalidation of "${namespace}": ${response.status} ${response.statusText}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[ADMIN] could not reach the storefront to revalidate "${namespace}":`, error);
    return false;
  }
}

// authMiddleware must run before adminOnly so req.user is populated;
// applying both router-wide guards every admin route.
router.use(authMiddleware, adminOnly);

/**
 * Drafts live at a reserved version below every published one.
 *
 * @@unique([namespace, path, version]) then gives each path exactly one draft
 * slot — a save is an upsert, not an append — while publish moves the row up to
 * the next real version. It also means a read that forgets `status: PUBLISHED`
 * still cannot surface a draft, because a draft never holds the top version.
 */
const DRAFT_VERSION = 0;

/** Bounds a single save so one bad admin form cannot fill the column. */
const MAX_VALUES_PER_WRITE = 200;
const MAX_VALUE_BYTES = 20_000;

/**
 * Shape checks only — this is NOT an allowlist.
 *
 * KNOWN GAP. The authoritative allowlist is `validateWrite` in the frontend
 * content registry (frontend/src/content/define.ts): it rejects any path the
 * schema does not declare, and type-checks the value against that field. The
 * registry cannot be imported here because it lives in the frontend package, so
 * this endpoint stores whatever path an authenticated admin sends as long as it
 * looks like a JSON pointer. Two things keep that from being a hole today: the
 * routes are admin-only, and `resolveContent` drops any stored value whose path
 * is not in the schema, so an unknown path is inert rather than rendered. The
 * fix is to move the registry into a package both sides import and run
 * validateWrite here as well; until then, treat the frontend as the only place
 * that knows what is editable.
 */
const PATH_PATTERN = /^(\/[A-Za-z0-9_-]+){1,8}$/;
const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

interface ContentEntry {
  path: string;
  value: Prisma.InputJsonValue;
  /** Mirrors the registry's `field.private`; keeps the value off the public read. */
  isPrivate: boolean;
}

/** Serialised row for the admin UI. */
const toEntry = (row: ContentValue) => ({
  path: row.path,
  value: row.value,
  version: row.version,
  updatedById: row.updatedById,
  updatedAt: row.updatedAt,
  publishedAt: row.publishedAt,
});

/** Just the pair the frontend's resolveContent() consumes. */
const toStoredValue = (row: ContentValue) => ({ path: row.path, value: row.value });

/**
 * Reduce published history down to the current value of each path.
 *
 * Publishing never rewrites older rows, so a namespace holds every version a
 * path has ever had. Done in JS rather than DISTINCT ON because a namespace is
 * tens of fields, and the whole set is already being read.
 */
const latestPerPath = (rows: ContentValue[]): ContentValue[] => {
  const byPath = new Map<string, ContentValue>();
  for (const row of rows) {
    const current = byPath.get(row.path);
    if (!current || row.version > current.version) byPath.set(row.path, row);
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
};

/** Validate the :namespace param, or throw the 400 the caller should send. */
const requireNamespace = (raw: string): string => {
  if (!NAMESPACE_PATTERN.test(raw)) {
    throw new HttpError(400, 'namespace must be a lowercase slug, e.g. "brand" or "custom-wear"');
  }
  return raw;
};

/** Whitelist + validate a `{ values: [{ path, value }] }` write body. */
const pickContentValues = (
  body: Record<string, unknown>
): { entries: ContentEntry[]; errors: string[] } => {
  const entries: ContentEntry[] = [];
  const errors: string[] = [];
  const { values } = body;

  if (!Array.isArray(values)) {
    return { entries, errors: ['values must be an array of { path, value }'] };
  }
  if (values.length === 0) errors.push('values must contain at least one entry');
  if (values.length > MAX_VALUES_PER_WRITE) {
    errors.push(`values must contain at most ${MAX_VALUES_PER_WRITE} entries`);
  }

  values.slice(0, MAX_VALUES_PER_WRITE).forEach((raw, index) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errors.push(`values[${index}] must be an object`);
      return;
    }
    const entry = raw as Record<string, unknown>;

    if (typeof entry.path !== 'string' || !PATH_PATTERN.test(entry.path)) {
      errors.push(`values[${index}].path must be a JSON pointer, e.g. /hero/heading`);
      return;
    }
    // A missing key is not the same as a null value: undefined cannot be stored
    // in a Json column, and silently writing null would blank the field.
    if (!('value' in entry)) {
      errors.push(`values[${index}].value is required (use null to store an empty value)`);
      return;
    }

    // The caller declares this from the registry, which is the only place that
    // knows a field is sensitive. Anything not explicitly true is public, so a
    // malformed flag fails closed to the safe-to-publish reading rather than
    // silently marking real content private and hiding it from the storefront.
    const isPrivate = entry.isPrivate === true;

    let serialised: string;
    try {
      serialised = JSON.stringify(entry.value ?? null);
    } catch {
      errors.push(`values[${index}].value must be JSON-serialisable`);
      return;
    }
    if (serialised.length > MAX_VALUE_BYTES) {
      errors.push(`values[${index}].value exceeds ${MAX_VALUE_BYTES} bytes`);
      return;
    }

    entries.push({
      path: entry.path,
      isPrivate,
      // Prisma needs the sentinel to write a JSON null into a required Json column.
      value: (entry.value === null || entry.value === undefined
        ? Prisma.JsonNull
        : entry.value) as Prisma.InputJsonValue,
    });
  });

  return { entries, errors };
};

/**
 * @route GET /admin/content/:namespace
 * @description Get published and draft content values for a namespace
 * @access Admin only
 */
router.get('/:namespace', async (req: Request, res: Response) => {
  try {
    const namespace = requireNamespace(req.params.namespace);

    const rows = await prisma.contentValue.findMany({
      where: { namespace },
      orderBy: [{ path: 'asc' }, { version: 'asc' }],
    });

    const published = latestPerPath(rows.filter((row) => row.status === 'PUBLISHED'));
    const draft = rows.filter((row) => row.status === 'DRAFT');

    res.json({
      success: true,
      message: 'Content fetched',
      data: {
        namespace,
        version: published.reduce((max, row) => Math.max(max, row.version), 0),
        published: published.map(toEntry),
        draft: draft.map(toEntry),
      },
    });
  } catch (error) {
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    console.error('[ADMIN] content fetch failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch content' });
  }
});

/**
 * @route PUT /admin/content/:namespace
 * @description Upsert draft content values (does not affect the storefront)
 * @access Admin only
 */
router.put('/:namespace', async (req: AuthRequest, res: Response) => {
  try {
    const namespace = requireNamespace(req.params.namespace);
    const { entries, errors } = pickContentValues((req.body ?? {}) as Record<string, unknown>);

    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }

    // One batch, one transaction: a partially applied save would leave the
    // admin previewing a draft they never composed.
    await prisma.$transaction(
      entries.map((entry) =>
        prisma.contentValue.upsert({
          where: {
            namespace_path_version: { namespace, path: entry.path, version: DRAFT_VERSION },
          },
          create: {
            namespace,
            path: entry.path,
            value: entry.value,
            status: 'DRAFT',
            version: DRAFT_VERSION,
            isPrivate: entry.isPrivate,
            updatedById: req.userId,
          },
          update: {
            value: entry.value,
            isPrivate: entry.isPrivate,
            updatedById: req.userId,
          },
        })
      )
    );

    const draft = await prisma.contentValue.findMany({
      where: { namespace, status: 'DRAFT' },
      orderBy: { path: 'asc' },
    });

    res.json({
      success: true,
      message: 'Draft saved',
      data: { namespace, draft: draft.map(toEntry) },
    });
  } catch (error) {
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    console.error('[ADMIN] content draft save failed:', error);
    res.status(500).json({ success: false, message: 'Failed to save content draft' });
  }
});

/**
 * @route POST /admin/content/:namespace/publish
 * @description Promote every draft value to PUBLISHED at the next version
 * @access Admin only
 */
router.post('/:namespace/publish', async (req: AuthRequest, res: Response) => {
  try {
    const namespace = requireNamespace(req.params.namespace);

    const result = await prisma.$transaction(async (tx) => {
      const drafts = await tx.contentValue.findMany({
        where: { namespace, status: 'DRAFT' },
        orderBy: { path: 'asc' },
      });
      if (drafts.length === 0) {
        throw new HttpError(409, 'There is nothing to publish in this namespace');
      }

      const before = latestPerPath(
        await tx.contentValue.findMany({ where: { namespace, status: 'PUBLISHED' } })
      );

      const highest = await tx.contentValue.aggregate({
        where: { namespace },
        _max: { version: true },
      });
      const nextVersion = (highest._max.version ?? 0) + 1;

      // Promotion is an UPDATE, never a delete-then-insert. Older published
      // rows are left exactly where they are and simply stop being the highest
      // version for their path, so a publish cannot remove content it did not
      // replace — and if the update collides (a concurrent publish already took
      // this version) the whole transaction rolls back with the drafts intact.
      await tx.contentValue.updateMany({
        where: { namespace, status: 'DRAFT' },
        data: {
          status: 'PUBLISHED',
          version: nextVersion,
          publishedAt: new Date(),
        },
      });

      const after = latestPerPath(
        await tx.contentValue.findMany({ where: { namespace, status: 'PUBLISHED' } })
      );

      // Snapshots are stored in the { path, value } shape the PUT body takes,
      // so reverting a bad publish is replaying oldValue through this API.
      // updatedById stays with whoever drafted each value; the log records who
      // released it.
      await tx.auditLog.create({
        data: {
          userId: req.userId,
          action: 'PUBLISH',
          resource: 'ContentValue',
          resourceId: namespace,
          oldValue: before.map(toStoredValue) as unknown as Prisma.InputJsonValue,
          newValue: after.map(toStoredValue) as unknown as Prisma.InputJsonValue,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        },
      });

      return { version: nextVersion, publishedCount: drafts.length, published: after };
    });

    // After the transaction: the values are live, so the cache is now the only
    // thing standing between the publish and the storefront.
    const revalidated = await revalidateStorefront(namespace);

    res.json({
      success: true,
      message: `Published ${result.publishedCount} value(s) as version ${result.version}`,
      data: {
        namespace,
        version: result.version,
        published: result.published.map(toEntry),
        /**
         * False means the values are live but the storefront may serve a
         * cached copy for a while. The admin is told rather than left to
         * wonder why the site looks unchanged.
         */
        revalidated,
      },
    });
  } catch (error) {
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({
        success: false,
        message: 'This namespace was published concurrently — reload and try again',
      });
      return;
    }
    console.error('[ADMIN] content publish failed:', error);
    res.status(500).json({ success: false, message: 'Failed to publish content' });
  }
});

/**
 * @route DELETE /admin/content/:namespace/draft
 * @description Discard unpublished draft values for a namespace
 * @access Admin only
 */
router.delete('/:namespace/draft', async (req: Request, res: Response) => {
  try {
    const namespace = requireNamespace(req.params.namespace);

    // Scoped to DRAFT, so the worst case is losing edits that were never live.
    const { count } = await prisma.contentValue.deleteMany({
      where: { namespace, status: 'DRAFT' },
    });

    res.json({
      success: true,
      message: `Discarded ${count} draft value(s)`,
      data: { namespace, discarded: count },
    });
  } catch (error) {
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    console.error('[ADMIN] content draft discard failed:', error);
    res.status(500).json({ success: false, message: 'Failed to discard content draft' });
  }
});

/**
 * Public read, mounted at /api/content in index.ts — deliberately outside the
 * admin router so it never inherits authMiddleware.
 *
 * @route GET /content/:namespace
 * @description Published content values for a namespace
 * @access Public
 */
export const publicContentRouter = Router();

publicContentRouter.get('/:namespace', async (req: Request, res: Response) => {
  try {
    const namespace = requireNamespace(req.params.namespace);

    // PUBLISHED only, and never a value flagged private. Drafts are
    // preview-only, and private values exist precisely so operational numbers
    // — cost prices, fraud thresholds — cannot be read off the storefront.
    const rows = await prisma.contentValue.findMany({
      where: { namespace, status: 'PUBLISHED', isPrivate: false },
    });
    const published = latestPerPath(rows);

    // A namespace with nothing published is not an error: the storefront
    // renders from its compiled defaults, and 404ing here would turn "nobody
    // has edited this yet" into a failed page load.
    res.json({
      success: true,
      message: 'Content fetched',
      data: {
        namespace,
        version: published.reduce((max, row) => Math.max(max, row.version), 0),
        values: published.map(toStoredValue),
      },
    });
  } catch (error) {
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    console.error('[CONTENT] public fetch failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch content' });
  }
});

export default router;
