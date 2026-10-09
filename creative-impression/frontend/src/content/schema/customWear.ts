import { defineContent } from '../define';
import { field } from '../field';

/**
 * Custom Wear copy and banner layout.
 *
 * A port of `config/custom-wear/content.ts`, grouped the same way and carrying
 * the same values, so resolving this namespace against an empty database
 * reproduces the Custom Wear pages exactly as they ship today.
 *
 * The collections in that file — the accordion order, the quote countries, the
 * accepted upload extensions — and the responsive column map are deliberately
 * absent: they are lists, not values, and a row of text boxes is the wrong
 * editor for them. They stay in code until there is a list editor. Where one of
 * those lists constrains a value that IS editable, the constraint is mirrored
 * here as a `select` so the two cannot disagree.
 */
export const customWearContent = defineContent('custom-wear', {
  hero: {
    eyebrow: field.text('Creative Impression', {
      label: 'Eyebrow',
      max: 40,
      // The banner reads fine without it, so clearing it has to stay legal.
      optional: true,
    }),
    heading: field.text('Custom Wear', { label: 'Heading', max: 40 }),
    description: field.textarea(
      'Create apparel your way. Shop customizable styles or request a quote for bulk and business orders.',
      { label: 'Description', max: 220 }
    ),

    backgroundImage: field.image('/images/Banner%20Customize.webp', {
      label: 'Background image',
      help: 'Set the width and height below to the new file’s pixel size at the same time, or the banner crops.',
    }),
    /**
     * These describe the file rather than the design: from tablet up the banner
     * sizes itself to this ratio so the artwork is never cropped. They are only
     * ever changed together with the image above.
     */
    backgroundWidth: field.number(1983, {
      label: 'Background image width (px)',
      min: 1,
      max: 8000,
    }),
    backgroundHeight: field.number(793, {
      label: 'Background image height (px)',
      min: 1,
      max: 8000,
    }),

    backgroundPositionMobile: field.text('68% center', {
      label: 'Focal point (mobile)',
      max: 40,
      help: 'CSS object-position, used only where the viewport is narrower than the artwork and a crop is unavoidable.',
    }),
    backgroundPositionDesktop: field.text('center center', {
      label: 'Focal point (desktop)',
      max: 40,
    }),
    maxHeightDesktop: field.length('820px', {
      label: 'Maximum height',
      help: 'Keeps the banner from dominating an ultra-wide monitor; past roughly 2050px wide it crops slightly instead.',
    }),

    backgroundColor: field.color('#111111', {
      label: 'Background colour',
      help: 'Sits behind and beside the artwork, so it should match the image edges.',
    }),
    // Text, not a colour picker: this is the scrim that keeps the heading
    // legible over the photo, and it is a gradient rather than a single colour.
    overlayColor: field.text(
      'linear-gradient(90deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.15) 100%)',
      { label: 'Overlay', max: 240 }
    ),
    headingColor: field.color('#FFFFFF', { label: 'Heading colour' }),
    // Also text: it carries an alpha channel, which the hex-only colour field
    // cannot express.
    textColor: field.text('rgba(255,255,255,0.86)', {
      label: 'Description colour',
      max: 40,
    }),

    align: field.select(['left', 'center'], 'left', { label: 'Text alignment' }),
    minHeightDesktop: field.length('420px', { label: 'Minimum height (desktop)' }),
    minHeightMobile: field.length('340px', { label: 'Minimum height (mobile)' }),
    headingFontSize: field.length('var(--cw-fs-hero)', {
      label: 'Heading size',
      help: 'Points at the Custom Wear hero token so the banner tracks the type scale; a fixed length opts out of it.',
    }),
    descriptionFontSize: field.length('clamp(14px, 1.3vw, 19px)', {
      label: 'Description size',
    }),
    descriptionMaxWidth: field.length('540px', {
      label: 'Description width',
      help: 'Caps the measure so the paragraph does not run the whole width of the banner.',
    }),
  },

  /**
   * Short UI strings. The maximums are the point of this group: these render
   * inside buttons, chips and card footers that were laid out for two or three
   * words, and a long value overflows or truncates on a page the admin may
   * never open.
   */
  labels: {
    shopNow: field.text('Shop Now', { label: 'Shop mode', max: 24 }),
    getQuote: field.text('Get Quote', { label: 'Quote mode', max: 24 }),
    modeGroupLabel: field.text('Choose how you want to order', {
      label: 'Mode group label',
      max: 60,
      help: 'Names the shop / quote toggle for screen readers.',
    }),
    shopCta: field.text('Customize & Add to Cart', { label: 'Product CTA (shop)', max: 32 }),
    quoteCta: field.text('Request Quote', { label: 'Product CTA (quote)', max: 32 }),
    cardShopCta: field.text('Customize Now', { label: 'Card CTA (shop)', max: 24 }),
    cardQuoteCta: field.text('Get Quote', { label: 'Card CTA (quote)', max: 24 }),
    buyNow: field.text('Buy Now', { label: 'Buy now', max: 24 }),
    browseDesigns: field.text('Browse Designs', { label: 'Browse designs', max: 24 }),
    uploadDesign: field.text('Upload Design', { label: 'Upload design', max: 24 }),
    sizeGuide: field.text('Size Guide', { label: 'Size guide', max: 24 }),
    filters: field.text('Filters', { label: 'Filters', max: 20 }),
    clearAll: field.text('Clear All', { label: 'Clear all filters', max: 20 }),
    searchPlaceholder: field.text('Search Custom Wear', { label: 'Search placeholder', max: 40 }),
    sortLabel: field.text('Sort By', { label: 'Sort label', max: 20 }),
    categoriesHeading: field.text('Custom Wear Categories', {
      label: 'Categories heading',
      max: 48,
    }),
    relatedHeading: field.text('You May Also Like', { label: 'Related heading', max: 48 }),
    alsoViewedHeading: field.text('Customers Also Viewed', {
      label: 'Also viewed heading',
      max: 48,
    }),
    recentlyViewedHeading: field.text('Recently Viewed', {
      label: 'Recently viewed heading',
      max: 48,
    }),
    emptyResultsTitle: field.text('No products match your selected filters.', {
      label: 'Empty results title',
      max: 80,
    }),
    emptyResultsBody: field.text(
      'Try removing a filter, or start from one of the categories below.',
      { label: 'Empty results body', max: 160 }
    ),
    quoteSuccessTitle: field.text('Quote request submitted successfully.', {
      label: 'Quote success message',
      max: 80,
    }),
  },

  collection: {
    defaultHeading: field.text('Custom Wear', {
      label: 'Default heading',
      max: 40,
      help: 'The H1 when no category is selected.',
    }),
    // `columns` is omitted: five numbers keyed by breakpoint are a map, not a
    // value, and changing one in isolation breaks the grid rhythm at the widths
    // the admin is not currently looking at.
  },

  productPage: {
    // `accordionOrder` is omitted — reordering seven ids needs a list editor,
    // not seven text boxes. The options below mirror that list so the
    // default-open section can only name a section that exists: a typo would
    // leave every accordion shut, which nobody notices from the admin.
    defaultOpenAccordionId: field.select(
      [
        'product-details',
        'fabric-construction',
        'size-dimensions',
        'printing-embroidery',
        'shipping-delivery',
        'care-instructions',
        'returns-policy',
      ],
      'product-details',
      { label: 'Section open by default' }
    ),

    /**
     * On: the ordering rail is short enough to sit still while the stage
     * scrolls. It was switched off when the rail also carried the design tool
     * and ran taller than the viewport, which pinned it at the top offset and
     * put its own CTA out of reach. The design tool now lives in the stage.
     */
    stickySummary: field.boolean(true, { label: 'Sticky ordering rail' }),
    stickyTopOffset: field.length('96px', {
      label: 'Sticky offset from top',
      help: 'Clears the header; too small and the rail slides underneath it.',
    }),
    galleryThumbnailCount: field.number(8, {
      label: 'Gallery thumbnails',
      min: 1,
      max: 12,
      help: 'Bounded so the thumbnail rail cannot outgrow the image it sits beside.',
    }),

    /**
     * `silhouette` by default because it is the only option that is always
     * truthful. `tint` multiplies the colour over the product photo, which
     * reads well on mid and dark shades but cannot lighten a garment — white
     * and yellow come out muddy, and it stains white collar trim and prints
     * along with the fabric. Switch to `tint` to compare, or to `none` once
     * real per-colour photography exists for every shade.
     */
    colorFallback: field.select(['silhouette', 'tint', 'none'], 'silhouette', {
      label: 'Colour fallback',
      help: 'What the gallery shows for a colour with no photograph of its own. A real photo always wins; this only decides the fallback.',
    }),
    colorTintStrength: field.number(0.72, {
      label: 'Tint opacity',
      min: 0,
      max: 1,
      help: 'Only applies when the fallback is tint. 0 hides the overlay entirely.',
    }),
  },

  quote: {
    introText: field.textarea(
      'Tell us what you need and our team replies with pricing, lead times and a digital proof — usually within one business day.',
      {
        label: 'Intro',
        max: 300,
        help: 'It promises a response time — check with the team before changing that part.',
      }
    ),
    // `countries` is omitted for the same reason as the accordion order, and
    // these options mirror it: free text here could name a country the form's
    // own dropdown does not offer, leaving it with nothing selected.
    defaultCountry: field.select(
      [
        'India',
        'United Arab Emirates',
        'United Kingdom',
        'United States',
        'Australia',
        'Canada',
        'Singapore',
        'Germany',
        'Saudi Arabia',
        'Qatar',
      ],
      'India',
      { label: 'Default country' }
    ),
    submitLabel: field.text('Submit Quote Request', { label: 'Submit button', max: 32 }),
    startingFromPrefix: field.text('Starting from', {
      label: 'Price prefix',
      max: 24,
      help: 'Prefixes the price shown under the CTA in quote mode.',
    }),
    volumeContactThreshold: field.number(1000, {
      label: 'Volume enquiry threshold',
      min: 1,
      max: 100000,
      help: 'Above this quantity the price is replaced by the message below.',
    }),
    volumeContactText: field.text('Contact us for volume pricing', {
      label: 'Volume enquiry message',
      max: 60,
    }),
  },

  upload: {
    // `acceptedExtensions` and `backendPendingExtensions` are omitted: both are
    // lists, and the second is only meaningful as a subset of the first — two
    // separate editors could disagree and flag an extension nobody can pick.
    maxFileSizeMb: field.number(15, {
      label: 'Maximum file size (MB)',
      min: 1,
      // Capped at what POST /api/custom-wear/artwork accepts: this is the
      // browser-side check, and setting it higher fails only after the customer
      // has picked a file, where no admin would see it. Lower it, never raise it.
      max: 15,
      help: 'Shown to the customer and checked before the file is sent.',
    }),
    maxFiles: field.number(5, {
      label: 'Maximum files per design',
      min: 1,
      max: 10,
      help: 'Further files are refused once this many are attached.',
    }),
    helpText: field.textarea(
      'PDF or high-resolution PNG reproduces best. SVGs are converted to PNG. For raster files use 300 DPI at print size.',
      {
        label: 'Upload help text',
        max: 200,
        help: 'It names the accepted formats, which are still fixed in code — keep the two in step.',
      }
    ),
  },
});

export type CustomWearContent = typeof customWearContent.defaults;
