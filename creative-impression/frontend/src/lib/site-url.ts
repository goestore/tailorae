/**
 * The site's public origin, for anything that has to emit an absolute URL —
 * canonical links, Open Graph images, the sitemap and robots.txt.
 *
 * Relative URLs are fine everywhere else and are what the rest of the app uses.
 * These few places cannot use them: a crawler reading `/sitemap.xml` has no
 * base to resolve a relative entry against, and a social card with a relative
 * image renders blank.
 */
const FALLBACK_ORIGIN = 'http://localhost:3000';

export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return FALLBACK_ORIGIN;
  // Trailing slashes would double up when a path is appended.
  return configured.replace(/\/+$/, '');
}

/**
 * Absolute URL for a site-relative path.
 *
 * Path segments are percent-encoded, because uploaded filenames routinely carry
 * spaces ("Male Model.webp") and a raw space makes the URL invalid — Next
 * encodes the ones it emits itself, so an unencoded one only shows up in
 * hand-built values like structured data.
 */
export function absoluteUrl(path: string): string {
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  const [pathname, query] = withLeadingSlash.split('?');
  const encoded = pathname
    .split('/')
    // Already-encoded input must not be double-encoded: decode first, and fall
    // back to the raw segment if it carries a stray % that cannot be decoded.
    .map((segment) => {
      try {
        return encodeURIComponent(decodeURIComponent(segment));
      } catch {
        return encodeURIComponent(segment);
      }
    })
    .join('/');
  return `${siteUrl()}${encoded}${query ? `?${query}` : ''}`;
}

/**
 * Base URL of the backend API for server-side fetches.
 *
 * `API_URL_INTERNAL` is the loopback address of the API on the same box
 * (http://127.0.0.1:5000/api). A server render that used the public URL would
 * leave the machine, cross TLS and come back through nginx to reach a process
 * a few hundred microseconds away — paid on every uncached render. It is also
 * the only address that works before DNS points at the new server during a
 * cutover.
 *
 * Not `NEXT_PUBLIC_`: this value must never be inlined into the browser bundle,
 * where a loopback address is unreachable.
 */
export function apiBase(): string {
  const internal = process.env.API_URL_INTERNAL?.trim();
  const base = internal || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
  return base.replace(/\/+$/, '');
}
