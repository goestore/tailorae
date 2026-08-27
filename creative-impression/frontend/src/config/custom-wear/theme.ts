/**
 * Custom Wear theme.
 *
 * SINGLE SOURCE OF TRUTH for every colour, font size and radius used by the
 * Custom Wear module. Nothing in `src/components/custom-wear/**` hardcodes a
 * brand colour — change it here and the whole module follows.
 *
 * Everything below is plain data, so it can be replaced by an admin/CMS fetch
 * later without touching a component (see `resolveCustomWearTheme`).
 */

import type { CSSProperties } from 'react';

export interface CustomWearButtonTheme {
  inactiveBackground: string;
  inactiveText: string;
  inactiveBorder: string;
  activeBackground: string;
  activeText: string;
  activeBorder: string;
  hoverBackground: string;
  hoverText: string;
  fontFamily: string;
  fontSizeDesktop: string;
  fontSizeTablet: string;
  fontSizeMobile: string;
  fontWeight: number;
  letterSpacing: string;
  borderRadius: string;
  borderWidth: string;
  paddingX: string;
  paddingY: string;
  minWidth: string;
  height: string;
  transitionMs: number;
}

export interface CustomWearTypographyTheme {
  headingFontFamily: string;
  bodyFontFamily: string;
  heroHeading: string;
  pageHeading: string;
  sectionHeading: string;
  productTitle: string;
  body: string;
  smallLabel: string;
  microLabel: string;
}

export interface CustomWearTheme {
  /** Accent used for selected states, CTAs and active chips. */
  primaryColor: string;
  primaryColorHover: string;
  primaryColorSoft: string;
  onPrimaryColor: string;

  black: string;
  white: string;

  ink: string;
  inkMuted: string;
  inkSubtle: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderStrong: string;

  success: string;
  danger: string;

  radiusCard: string;
  radiusControl: string;
  radiusChip: string;

  sidebarWidth: string;

  modeButton: CustomWearButtonTheme;
  ctaButton: CustomWearButtonTheme;
  typography: CustomWearTypographyTheme;
}

const HEADING_FONT = 'var(--font-inter), system-ui, sans-serif';
const BODY_FONT = 'var(--font-inter), system-ui, sans-serif';

export const customWearTheme: CustomWearTheme = {
  primaryColor: '#FBB602',
  primaryColorHover: '#E5A502',
  primaryColorSoft: 'rgba(251, 182, 2, 0.12)',
  onPrimaryColor: '#000000',

  black: '#000000',
  white: '#FFFFFF',

  ink: '#111111',
  inkMuted: '#3F3F46',
  inkSubtle: '#71717A',
  surface: '#FFFFFF',
  surfaceAlt: '#FAFAF9',
  border: '#E7E5E4',
  borderStrong: '#D6D3D1',

  success: '#1B7F4B',
  danger: '#C02626',

  /* Geometry matches the site design system in globals.css: cards and
     controls are square (--r-card / --r-control are both 0), and only chips
     and pills are rounded. Custom Wear used to run 14px rounded cards, which
     read as a different site from the rest of the catalog. */
  radiusCard: '0px',
  radiusControl: '0px',
  radiusChip: '999px',

  sidebarWidth: '248px',

  /** Shop Now / Get Quote selector. */
  modeButton: {
    inactiveBackground: '#000000',
    inactiveText: '#FFFFFF',
    inactiveBorder: '#000000',
    activeBackground: '#FBB602',
    activeText: '#000000',
    activeBorder: '#FBB602',
    hoverBackground: '#1A1A1A',
    hoverText: '#FFFFFF',
    fontFamily: BODY_FONT,
    fontSizeDesktop: '18px',
    fontSizeTablet: '16px',
    fontSizeMobile: '15px',
    fontWeight: 600,
    letterSpacing: '0.01em',
    borderRadius: '0px',
    borderWidth: '1px',
    paddingX: '28px',
    paddingY: '14px',
    minWidth: '176px',
    height: 'auto',
    transitionMs: 200,
  },

  /** Product card + product page primary actions. */
  ctaButton: {
    inactiveBackground: '#000000',
    inactiveText: '#FFFFFF',
    inactiveBorder: '#000000',
    activeBackground: '#FBB602',
    activeText: '#000000',
    activeBorder: '#FBB602',
    hoverBackground: '#FBB602',
    hoverText: '#000000',
    fontFamily: BODY_FONT,
    fontSizeDesktop: '15px',
    fontSizeTablet: '14px',
    fontSizeMobile: '14px',
    fontWeight: 600,
    letterSpacing: '0.01em',
    borderRadius: '0px',
    borderWidth: '1px',
    paddingX: '20px',
    paddingY: '12px',
    minWidth: '0',
    height: 'auto',
    transitionMs: 200,
  },

  typography: {
    headingFontFamily: HEADING_FONT,
    bodyFontFamily: BODY_FONT,
    heroHeading: 'clamp(34px, 5.2vw, 68px)',
    pageHeading: 'clamp(28px, 3.6vw, 46px)',
    sectionHeading: 'clamp(18px, 1.8vw, 26px)',
    productTitle: 'clamp(14px, 1vw, 16px)',
    body: 'clamp(14px, 1vw, 16px)',
    smallLabel: 'clamp(12px, 0.9vw, 14px)',
    microLabel: '12px',
  },
};

/**
 * Merge point for admin/CMS overrides.
 *
 * Today it returns the static theme. When theme settings move into the admin,
 * fetch them and pass them here — every component reads the result, so no
 * component changes are needed.
 */
export function resolveCustomWearTheme(
  overrides?: Partial<CustomWearTheme>
): CustomWearTheme {
  if (!overrides) return customWearTheme;
  return {
    ...customWearTheme,
    ...overrides,
    modeButton: { ...customWearTheme.modeButton, ...overrides.modeButton },
    ctaButton: { ...customWearTheme.ctaButton, ...overrides.ctaButton },
    typography: { ...customWearTheme.typography, ...overrides.typography },
  };
}

/**
 * CSS custom properties injected once at the top of each Custom Wear page.
 * Components reference `var(--cw-*)` so a single style object drives the
 * module and Tailwind class churn stays low.
 */
export function customWearCssVariables(
  theme: CustomWearTheme = customWearTheme
): CSSProperties {
  return {
    '--cw-primary': theme.primaryColor,
    '--cw-primary-hover': theme.primaryColorHover,
    '--cw-primary-soft': theme.primaryColorSoft,
    '--cw-on-primary': theme.onPrimaryColor,
    '--cw-black': theme.black,
    '--cw-white': theme.white,
    '--cw-ink': theme.ink,
    '--cw-ink-muted': theme.inkMuted,
    '--cw-ink-subtle': theme.inkSubtle,
    '--cw-surface': theme.surface,
    '--cw-surface-alt': theme.surfaceAlt,
    '--cw-border': theme.border,
    '--cw-border-strong': theme.borderStrong,
    '--cw-success': theme.success,
    '--cw-danger': theme.danger,
    '--cw-radius-card': theme.radiusCard,
    '--cw-radius-control': theme.radiusControl,
    '--cw-radius-chip': theme.radiusChip,
    '--cw-sidebar-width': theme.sidebarWidth,
    '--cw-font-heading': theme.typography.headingFontFamily,
    '--cw-font-body': theme.typography.bodyFontFamily,
    '--cw-fs-hero': theme.typography.heroHeading,
    '--cw-fs-page': theme.typography.pageHeading,
    '--cw-fs-section': theme.typography.sectionHeading,
    '--cw-fs-product': theme.typography.productTitle,
    '--cw-fs-body': theme.typography.body,
    '--cw-fs-small': theme.typography.smallLabel,
    '--cw-fs-micro': theme.typography.microLabel,
  } as CSSProperties;
}
