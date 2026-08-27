import { defineContent } from '../define';
import { field } from '../field';

/**
 * Site-wide brand and chrome.
 *
 * These values are currently typed directly into components and `globals.css`
 * — the announcement message lives in `AnnouncementBar.tsx`, the brand colour
 * in a `:root` token. Declaring them here does not move them yet; it makes
 * them addressable so the admin form, the write validator and the storefront
 * all read one definition.
 *
 * Defaults are the values the site ships with today, so resolving this
 * namespace against an empty database reproduces the current storefront
 * exactly.
 */
export const brandContent = defineContent('brand', {
  identity: {
    name: field.text('Creative Impression', { label: 'Store name', max: 60 }),
    tagline: field.text('Premium Fashion & Custom Apparel Platform', {
      label: 'Tagline',
      max: 120,
      help: 'Used in social cards and the site description.',
    }),
  },

  announcement: {
    enabled: field.boolean(true, { label: 'Show announcement bar' }),
    message: field.text(
      'FREE SHIPPING ON ORDERS OVER ₹999 • CUSTOMIZE YOUR PROFESSIONAL WEAR • B2B WHOLESALE PRICING',
      {
        label: 'Message',
        max: 200,
        help: 'Separate claims with • — the bar scrolls as one continuous line.',
      }
    ),
    scroll: field.boolean(true, {
      label: 'Scroll the message',
      help: 'Off shows a single truncated line instead of a marquee.',
    }),
    speedSeconds: field.number(32, {
      label: 'Scroll duration (seconds)',
      min: 8,
      max: 120,
      help: 'Lower is faster. Under ~20s becomes hard to read.',
    }),
  },

  /**
   * The 10% of the palette that is brand colour. The ink and surface tokens
   * are deliberately not editable: they carry the contrast guarantees the
   * whole design system rests on, and an admin cannot see which pairings they
   * would break.
   */
  theme: {
    brand: field.color('#FBB602', {
      label: 'Brand colour',
      help: 'Accents, active states and primary buttons. Text on it is near-black, so very dark values fail contrast.',
    }),
    brandHover: field.color('#E5A502', { label: 'Brand colour (hover)' }),
    sale: field.color('#D92D20', { label: 'Sale / error colour' }),
    success: field.color('#1B7F4B', { label: 'Success colour' }),
  },

  layout: {
    gutter: field.length('clamp(16px, 2.4vw, 48px)', {
      label: 'Page gutter',
      help: 'Space between content and the window edge, at every width.',
    }),
    contentMax: field.text('none', {
      label: 'Maximum content width',
      max: 20,
      help: '"none" runs edge to edge. A length such as 1440px centres the page instead.',
    }),
  },
});

export type BrandContent = typeof brandContent.defaults;
