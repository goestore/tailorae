import { defineContent } from '../define';
import { field } from '../field';

/**
 * Custom Wear design tokens.
 *
 * Mirrors `src/config/custom-wear/theme.ts`, which is the module's single
 * source of truth today. Field names match the `CustomWearTheme` and
 * `CustomWearButtonTheme` keys exactly, so pointing `resolveCustomWearTheme`
 * at this namespace later is a key-for-key merge rather than a translation
 * table that has to be kept in step.
 *
 * Defaults are copied verbatim from that file: resolving this namespace
 * against an empty database has to reproduce the Custom Wear pages exactly as
 * they ship today, so a "tidier" value here would be a silent redesign.
 *
 * Parts of the theme are deliberately absent, each noted where it would have
 * gone: corner geometry pinned to the site design system, the ink/surface/
 * border ramp that carries the contrast guarantees, and the handful of values
 * whose breakage an admin would not see.
 */
export const customWearThemeContent = defineContent('custom-wear-theme', {
  /**
   * The accent trio moves together. Text on the accent is near-black today, so
   * an admin who picks a dark accent has to be able to flip the text to white
   * in the same edit — that is the only reason `onPrimaryColor` is editable.
   *
   * `primaryColorSoft` (rgba(251, 182, 2, 0.12)) stays out: it is a 12% wash
   * of the accent, and hand-editing it lets it drift, leaving selected chips
   * washed in the previous brand colour. It should be derived from
   * `primaryColor` when the theme is wired up, not typed in twice.
   */
  primaryColor: field.color('#FBB602', {
    label: 'Accent colour',
    help: 'Selected states, CTAs and active chips.',
  }),
  primaryColorHover: field.color('#956400', { label: 'Accent colour (hover)' }),
  onPrimaryColor: field.color('#000000', {
    label: 'Text on accent',
    help: 'Must stay readable on the accent above — set it to #FFFFFF if you pick a dark accent.',
  }),

  /*
   * The ink / surface / border ramp (ink #111111, inkMuted #3F3F46, inkSubtle
   * #71717A, surface #FFFFFF, surfaceAlt #FAFAF9, border #E7E5E4,
   * borderStrong #D6D3D1) is not editable, and neither are the black/white
   * anchors. Every pairing in the module is contrast-checked against that
   * ramp; nudging one token fails the pairings it is not shown beside in the
   * admin, so the breakage lands on a page the editor never opens. The status
   * colours below are exempt because they are semantic rather than
   * structural — a wrong "success" green is wrong on sight.
   */
  success: field.color('#1B7F4B', { label: 'Success colour' }),
  danger: field.color('#C02626', { label: 'Error / danger colour' }),

  /*
   * Only the chip radius is editable. `radiusCard` and `radiusControl` are 0px
   * because they track --r-card / --r-control in globals.css: Custom Wear ran
   * 14px rounded cards once and read as a different site from the rest of the
   * catalog. Exposing them here would let this one module drift back out of
   * the design system, so card and control corners stay a globals.css edit.
   */
  radiusChip: field.length('999px', {
    label: 'Chip radius',
    help: 'Filter chips and pills only. 999px is a full pill; 0px squares them off.',
  }),

  sidebarWidth: field.length('248px', {
    label: 'Filter sidebar width',
    help: 'Wider eats into the product grid — past roughly 320px the grid drops a column.',
  }),

  /**
   * Shop Now / Get Quote selector.
   *
   * Hover is a near-black lift rather than the accent, because the selected
   * half of the pair is already the accent and the two would read as both
   * selected.
   */
  modeButton: {
    inactiveBackground: field.color('#000000', { label: 'Background' }),
    inactiveText: field.color('#FFFFFF', { label: 'Text' }),
    inactiveBorder: field.color('#000000', { label: 'Border' }),
    activeBackground: field.color('#FBB602', { label: 'Background (selected)' }),
    activeText: field.color('#000000', { label: 'Text (selected)' }),
    activeBorder: field.color('#FBB602', { label: 'Border (selected)' }),
    hoverBackground: field.color('#1A1A1A', { label: 'Background (hover)' }),
    hoverText: field.color('#FFFFFF', { label: 'Text (hover)' }),

    fontSizeDesktop: field.length('18px', { label: 'Font size (desktop)' }),
    fontSizeTablet: field.length('16px', { label: 'Font size (tablet)' }),
    fontSizeMobile: field.length('15px', { label: 'Font size (mobile)' }),
    fontWeight: field.number(400, { label: 'Font weight', min: 100, max: 900 }),
    letterSpacing: field.length('0.01em', { label: 'Letter spacing' }),

    borderWidth: field.length('1px', { label: 'Border width' }),
    paddingX: field.length('28px', { label: 'Horizontal padding' }),
    paddingY: field.length('14px', { label: 'Vertical padding' }),
    minWidth: field.length('176px', {
      label: 'Minimum width',
      help: 'Holds both halves the same width so the pair does not resize as you switch modes.',
    }),
    transitionMs: field.number(200, {
      label: 'Transition (ms)',
      min: 0,
      max: 1000,
      help: '0 switches instantly. Above ~400ms the selector feels laggy.',
    }),
  },

  /** Product card and product page primary actions. */
  ctaButton: {
    inactiveBackground: field.color('#000000', { label: 'Background' }),
    inactiveText: field.color('#FFFFFF', { label: 'Text' }),
    inactiveBorder: field.color('#000000', { label: 'Border' }),
    activeBackground: field.color('#FBB602', { label: 'Background (active)' }),
    activeText: field.color('#000000', { label: 'Text (active)' }),
    activeBorder: field.color('#FBB602', { label: 'Border (active)' }),
    hoverBackground: field.color('#FBB602', { label: 'Background (hover)' }),
    hoverText: field.color('#000000', { label: 'Text (hover)' }),

    fontSizeDesktop: field.length('15px', { label: 'Font size (desktop)' }),
    fontSizeTablet: field.length('14px', { label: 'Font size (tablet)' }),
    fontSizeMobile: field.length('14px', { label: 'Font size (mobile)' }),
    fontWeight: field.number(400, { label: 'Font weight', min: 100, max: 900 }),
    letterSpacing: field.length('0.01em', { label: 'Letter spacing' }),

    borderWidth: field.length('1px', { label: 'Border width' }),
    paddingX: field.length('20px', { label: 'Horizontal padding' }),
    paddingY: field.length('12px', { label: 'Vertical padding' }),
    minWidth: field.length('0', {
      label: 'Minimum width',
      help: '0 lets the button size to its label inside the card.',
    }),
    transitionMs: field.number(200, { label: 'Transition (ms)', min: 0, max: 1000 }),
  },

  /*
   * Neither button exposes `borderRadius` (0px, tracking --r-control) or
   * `height` ('auto'). Radius is the design-system decision above; height is
   * driven by the padding, and a fixed height clips labels once they wrap —
   * which happens at narrow widths the admin is not looking at while editing.
   */

  /**
   * The type scale. Each clamp carries its own responsive behaviour — first
   * value is the floor, last is the desktop cap — so one entry covers every
   * breakpoint and no per-breakpoint override is needed.
   *
   * `headingFontFamily` and `bodyFontFamily` are not editable: both resolve to
   * var(--font-inter), the next/font instance loaded in layout.tsx. A family
   * the app does not load falls back to system-ui silently, which looks like a
   * font rather than like a mistake.
   */
  typography: {
    heroHeading: field.length('clamp(34px, 5.2vw, 68px)', { label: 'Hero heading' }),
    pageHeading: field.length('clamp(28px, 3.6vw, 46px)', { label: 'Page heading' }),
    sectionHeading: field.length('clamp(18px, 1.8vw, 26px)', { label: 'Section heading' }),
    productTitle: field.length('clamp(14px, 1vw, 16px)', { label: 'Product title' }),
    body: field.length('clamp(14px, 1vw, 16px)', { label: 'Body text' }),
    smallLabel: field.length('clamp(12px, 0.9vw, 14px)', { label: 'Small label' }),
    microLabel: field.length('12px', {
      label: 'Micro label',
      help: 'Badges and helper text. Fixed rather than clamped so it never drops below 12px.',
    }),
  },
});

export type CustomWearThemeContent = typeof customWearThemeContent.defaults;
