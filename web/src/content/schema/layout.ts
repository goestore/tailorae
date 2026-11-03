import { defineContent } from '../define';
import { field } from '../field';

/**
 * Site chrome — the header and footer that wrap every page.
 *
 * These strings are typed directly into `components/layout/Header.tsx`,
 * `Footer.tsx` and `NewsletterForm.tsx` today. Declaring them here does not
 * move them yet; it makes them addressable, and the defaults below are copied
 * verbatim from those components so resolving this namespace against an empty
 * database reproduces the current chrome exactly.
 *
 * Two kinds of chrome are deliberately absent.
 *
 * Repeats of another namespace: the wordmark, the logo alt text and the
 * announcement bar message already live in `brand`. Declaring them again would
 * give one string two addresses, and whichever one an admin edited would look
 * broken half the time.
 *
 * Lists: the header navigation, its dropdowns, the footer link columns and the
 * social row are all label + href pairs. There is no list editor yet, and a
 * field that edits a label without its href would let an admin rename "Sale"
 * to something that still routes to /products/sale.
 */
export const layoutContent = defineContent('layout', {
  header: {
    searchPlaceholder: field.text('Search products...', {
      label: 'Search placeholder',
      max: 60,
    }),

    /**
     * The signed-in account dropdown. The Admin entry is role-gated, so only
     * someone who can already see it can edit it.
     */
    account: {
      menuLabel: field.text('My Account', { label: 'Account link', max: 30 }),
      adminLabel: field.text('Admin', { label: 'Admin link', max: 30 }),
      logoutLabel: field.text('Logout', { label: 'Log out', max: 30 }),
    },
  },

  footer: {
    blurb: field.textarea(
      'Your trusted partner for custom printing and business solutions. From business cards to bulk orders, we deliver quality products with exceptional service.',
      {
        label: 'Company blurb',
        max: 320,
        help: 'Sits under the logo, beside the link columns. Long copy pushes the social icons below the fold on mobile.',
      }
    ),

    /**
     * Column headings only. Their links are a list — see the namespace note.
     * The three columns share one grid row, so a heading long enough to wrap
     * knocks the columns out of alignment; hence the tight cap.
     */
    columns: {
      company: field.text('Company', { label: 'Column 1 heading', max: 24 }),
      shop: field.text('Shop', { label: 'Column 2 heading', max: 24 }),
      support: field.text('Support', { label: 'Column 3 heading', max: 24 }),
    },

    newsletter: {
      heading: field.text('Stay updated', { label: 'Heading', max: 40 }),
      subheading: field.text('Get the latest updates on new products and exclusive offers.', {
        label: 'Subheading',
        max: 140,
      }),
      emailPlaceholder: field.text('Enter your email', { label: 'Email placeholder', max: 60 }),
      submitLabel: field.text('Subscribe', {
        label: 'Button label',
        max: 24,
        help: 'Sits inline beside the email field on desktop, so a long label squeezes the input.',
      }),
    },

    /**
     * The standing promises in the bottom bar. They are claims about the
     * business rather than decoration, so they need to be correctable without
     * a deploy — "24/7 support" stops being true the day support hours change.
     */
    promises: {
      /**
       * Split because a brand-coloured heart icon renders between the two
       * halves: "Made with [heart] in India". Editing them as one string would
       * either lose the icon or hardcode where it sits.
       */
      madeInPrefix: field.text('Made with', { label: 'Made-in prefix', max: 24 }),
      madeInSuffix: field.text('in India', { label: 'Made-in suffix', max: 24 }),
      payments: field.text('Secure payments', { label: 'Payments promise', max: 40 }),
      support: field.text('24/7 support', { label: 'Support promise', max: 40 }),
    },

    /**
     * Only the tail of the copyright line. The year is computed at render and
     * the store name comes from `brand.identity.name`, so neither can drift
     * out of date here.
     */
    rightsNotice: field.text('All rights reserved.', { label: 'Rights notice', max: 60 }),
  },
});

export type LayoutContent = typeof layoutContent.defaults;
