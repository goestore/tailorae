import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site-url';

/**
 * Serves /robots.txt.
 *
 * The disallow list is everything that is either private to one shopper or
 * has no standalone value in a search result. `/invoice/` in particular holds
 * a name, an address and an order total, so it must never be crawled — it is
 * also marked `noindex` on the page itself, because robots.txt asks a crawler
 * not to fetch a URL and does not stop one that already knows it from listing
 * it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/auth/',
          '/dashboard/',
          '/seller',
          '/seller/',
          '/invoice/',
          // One shopper's own order. Carries `noindex` from its layout as well;
          // this is the belt to that pair of braces, and it matches how
          // `/invoice/` is already handled.
          '/orders/',
          // A results page per query anyone ever typed, competing with the
          // category pages for the same terms. `noindex, follow` is set on the
          // route too.
          '/search',
          '/cart',
          '/checkout',
          '/wishlist',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
