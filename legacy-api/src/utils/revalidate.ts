/**
 * Drop a storefront cache after the admin changes the catalogue.
 *
 * The brand and seller directories are cached for minutes at a time, which is
 * right for pages read far more often than they change — but it means a
 * suspended seller or a removed brand stays on the site until that window
 * elapses. This closes it.
 *
 * Best effort by design, exactly like the content publish hook it shares a
 * secret with: the write is already committed, so a frontend that is down must
 * not turn a successful save into a failed request.
 */

export type CatalogTag = 'brands' | 'sellers' | 'products';

export async function revalidateCatalog(tag: CatalogTag): Promise<boolean> {
  const secret = process.env.CONTENT_REVALIDATE_SECRET;
  if (!secret) {
    console.warn(
      `[ADMIN] CONTENT_REVALIDATE_SECRET is not set — saved, but the storefront will ` +
        `serve its cached "${tag}" until that expires.`
    );
    return false;
  }

  const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

  try {
    const response = await fetch(`${base}/api/content/revalidate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-content-revalidate-secret': secret,
      },
      body: JSON.stringify({ tag }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      console.error(
        `[ADMIN] storefront refused revalidation of "${tag}": ${response.status} ${response.statusText}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[ADMIN] could not reach the storefront to revalidate "${tag}":`, error);
    return false;
  }
}
