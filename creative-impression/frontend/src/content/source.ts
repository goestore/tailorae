import type { ContentDefinition, ContentGroup, Infer } from './define';
import { parseStoredValues, resolveContent, type StoredValue } from './resolve';

/**
 * Server-side content loading.
 *
 * This sits in front of every page that reads editable content, which makes
 * its contract narrower than "fetch some JSON": it must always hand back a
 * fully resolved namespace, and it must never be the reason a page fails to
 * render. A backend that is down, slow, half-migrated or returning nonsense
 * degrades to the compiled defaults — the content that ships in the bundle —
 * rather than to an error boundary.
 *
 * Reads are cached under one tag per namespace, so a publish invalidates
 * exactly the namespace it changed. Cache Components (`use cache` / `cacheTag`)
 * are not enabled in `next.config.js`, so the tag is attached through `fetch`'s
 * `next.tags` option instead.
 */

/**
 * The tag a publish revalidates: `revalidateTag(contentCacheTag(ns), 'max')`.
 *
 * Exported because the read path and the publish path have to agree on the
 * string, and a mismatch fails silently — the publish succeeds and nobody
 * ever sees it.
 */
export const contentCacheTag = (namespace: string): string => `content:${namespace}`;

/**
 * How long a cache miss may hold a render open. Content is not worth waiting
 * for: past this the page renders with defaults and the next request retries.
 */
const DEFAULT_TIMEOUT_MS = 2000;

/**
 * A backstop, not the mechanism. The tag is what makes a publish visible;
 * this only bounds how long content can sit stale if a publish ever fails to
 * revalidate it. Pass `revalidate: false` to rely on the tag alone.
 */
const DEFAULT_REVALIDATE_SECONDS = 3600;

export interface LoadContentOptions {
  /** Draft overrides applied on top of published values. Preview only. */
  draft?: StoredValue[] | null;
  /**
   * Bypass the cache. Preview reads set this so an editor sees their draft on
   * top of what is published right now, not on top of a cached copy.
   */
  fresh?: boolean;
  /** Seconds, or `false` to cache until the namespace tag is revalidated. */
  revalidate?: number | false;
  timeoutMs?: number;
  /** Defaults to a console warning. Anything it throws is swallowed. */
  onReject?: (path: string, reason: string) => void;
  /** Overrides `NEXT_PUBLIC_API_URL`. */
  baseUrl?: string;
}

const apiBase = (override?: string): string =>
  (override ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api').replace(/\/+$/, '');

const reasonFor = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/**
 * Pulls overrides out of whatever the endpoint actually returned.
 *
 * `parseStoredValues` does the defensive work — a truncated body, an object
 * where an array belongs, entries missing a path are all dropped rather than
 * thrown. This adds one thing: unwrapping the `{ success, data }` envelope the
 * backend puts around every successful read, so a bare array and the house
 * envelope are both accepted.
 */
function readPayload(raw: string): StoredValue[] | null {
  const direct = parseStoredValues(raw);
  if (direct) return direct;

  let envelope: unknown;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return null;
  }

  const data = (envelope as { data?: unknown } | null)?.data;
  if (Array.isArray(data)) return parseStoredValues(JSON.stringify(data));

  // The public endpoint wraps the list one level deeper, as
  // `{ data: { namespace, version, values } }`. Reading only `data` here meant
  // every storefront read fell through to the defaults while looking healthy.
  const values = (data as { values?: unknown } | null)?.values;
  return Array.isArray(values) ? parseStoredValues(JSON.stringify(values)) : null;
}

async function fetchPublished(
  namespace: string,
  options: LoadContentOptions
): Promise<StoredValue[] | null> {
  const url = `${apiBase(options.baseUrl)}/content/${encodeURIComponent(namespace)}`;

  try {
    const caching: RequestInit = options.fresh
      ? { cache: 'no-store' }
      : {
          cache: 'force-cache',
          next: {
            tags: [contentCacheTag(namespace)],
            revalidate: options.revalidate ?? DEFAULT_REVALIDATE_SECONDS,
          },
        };

    const response = await fetch(url, {
      ...caching,
      headers: { accept: 'application/json' },
      // The timeout signal also opts this request out of Next's per-render
      // fetch memoization, so read a namespace once per render — in the
      // layout — rather than in every component that needs a string.
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    // Every namespace starts out with nothing published. That is the defaults,
    // not a fault, and warning about it would train people to ignore the log.
    if (response.status === 404) return null;

    if (!response.ok) {
      console.warn(`[content] ${namespace}: backend returned ${response.status}, using defaults.`);
      return null;
    }

    const values = readPayload(await response.text());
    if (!values) {
      console.warn(`[content] ${namespace}: unreadable payload, using defaults.`);
    }
    return values;
  } catch (error) {
    // Unreachable, timed out, DNS, TLS, a body that died mid-read: the page
    // still has to render, so every one of them lands here.
    console.warn(`[content] ${namespace}: ${reasonFor(error)}, using defaults.`);
    return null;
  }
}

function rejectionReporter(
  namespace: string,
  custom: LoadContentOptions['onReject']
): (path: string, reason: string) => void {
  const report =
    custom ??
    ((path: string, reason: string) => {
      console.warn(`[content] ignored ${namespace}#${path}: ${reason}`);
    });

  // resolveContent calls this while building the tree, so a logger that throws
  // would escape into the render. A broken logger costs its own message only.
  return (path, reason) => {
    try {
      report(path, reason);
    } catch {
      /* deliberately ignored */
    }
  };
}

/**
 * Loads one namespace: published values from the backend over the compiled
 * defaults. Never throws; on any failure the result is the defaults, which is
 * exactly the storefront as it ships today.
 */
export async function loadContent<S extends ContentGroup>(
  definition: ContentDefinition<S>,
  options: LoadContentOptions = {}
): Promise<Infer<S>> {
  const values = await fetchPublished(definition.namespace, options);

  return resolveContent(definition, {
    values,
    draft: options.draft,
    onReject: rejectionReporter(definition.namespace, options.onReject),
  });
}

/**
 * Loads a namespace with unpublished edits laid over it, for the admin preview.
 *
 * The draft arrives as JSON when it is carried in a cookie or a request body,
 * so a string is accepted and parsed with the same tolerant reader as a
 * published payload: a corrupt draft previews as the published site instead of
 * failing the preview route.
 */
export function previewContent<S extends ContentGroup>(
  definition: ContentDefinition<S>,
  draft: StoredValue[] | string | null | undefined,
  options: Omit<LoadContentOptions, 'draft'> = {}
): Promise<Infer<S>> {
  return loadContent(definition, {
    fresh: true,
    ...options,
    draft: typeof draft === 'string' ? parseStoredValues(draft) : draft,
  });
}
