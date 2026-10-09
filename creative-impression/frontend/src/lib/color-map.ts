import type { CSSProperties } from 'react';

/**
 * Colour names to swatch colours.
 *
 * Ported from 9impression, whose shop grid draws a swatch under every card.
 * Colours are typed by hand when a variant is created, so the map has to cover
 * the spellings people actually use ("navy blue", "off white", "mustard") and
 * fall back visibly rather than silently when it meets one it does not know.
 *
 * `hex` on a colour always wins if it is ever stored; the name lookup is the
 * fallback, not the other way round.
 */

export type SwatchSource = {
  name?: string | null;
  hex?: string | null;
};

export const COLOR_MAP: Record<string, string> = {
  black: '#1a1a1a',
  white: '#f8f8f8',
  'off white': '#f5f5f0',
  ivory: '#fffff0',
  cream: '#fef3c7',
  beige: '#d4c5a9',
  tan: '#d2b48c',
  khaki: '#c8b87a',
  taupe: '#8b7765',
  brown: '#92400e',
  grey: '#6b7280',
  gray: '#6b7280',
  charcoal: '#374151',
  red: '#dc2626',
  maroon: '#7f1d1d',
  burgundy: '#800020',
  rust: '#c2410c',
  terracotta: '#e2725b',
  pink: '#f472b6',
  'baby pink': '#f9c6d0',
  'rose pink': '#f43f5e',
  'hot pink': '#ff69b4',
  fuchsia: '#e040fb',
  magenta: '#c026d3',
  purple: '#9333ea',
  lavender: '#c4b5fd',
  lilac: '#c8a2c8',
  violet: '#7c3aed',
  plum: '#8e4585',
  blue: '#3b82f6',
  'light blue': '#93c5fd',
  'sky blue': '#87ceeb',
  'royal blue': '#4169e1',
  'navy blue': '#1e3a8a',
  navy: '#1e3a8a',
  turquoise: '#40e0d0',
  aqua: '#22d3ee',
  green: '#16a34a',
  'mint green': '#6ee7b7',
  mint: '#3eb489',
  'sage green': '#9dc183',
  'olive green': '#4d7c0f',
  olive: '#4d7c0f',
  'forest green': '#166534',
  emerald: '#059669',
  teal: '#0d9488',
  'neon green': '#39ff14',
  yellow: '#eab308',
  'lemon yellow': '#fff176',
  'mustard yellow': '#e8a700',
  mustard: '#ca8a04',
  orange: '#f97316',
  'neon orange': '#ff5f1f',
  peach: '#ffb897',
  coral: '#f87171',
  gold: '#d4a843',
  silver: '#a8a8a8',
  copper: '#b87333',
  bronze: '#cd7f32',
  metallic: '#9ca3af',
  nude: '#e8c9a0',
  rose: '#fb7185',
  multi: 'linear-gradient(135deg,#ec4899,#3b82f6,#10b981,#f59e0b)',
  'multi-color': 'linear-gradient(135deg,#ec4899,#3b82f6,#10b981,#f59e0b)',
  'multi colour': 'linear-gradient(135deg,#ec4899,#3b82f6,#10b981,#f59e0b)',
  // The rest of Myntra's "Prominent Colour" list, so every value a seller can
  // pick paints a real swatch.
  steel: '#71797e',
  'grey melange': '#b4b4b4',
  'turquoise blue': '#06b6d4',
  'coffee brown': '#6f4e37',
  'sea green': '#2e8b57',
  'lime green': '#84cc16',
  'fluorescent green': '#39ff14',
  mauve: '#b784a7',
  'rose gold': '#b76e79',
  assorted: 'linear-gradient(135deg,#ec4899,#3b82f6,#10b981,#f59e0b)',
  champagne: '#f7e7ce',
  'camel brown': '#c19a6b',
  transparent: 'repeating-linear-gradient(45deg,#e5e5e5 0 3px,#fff 3px 6px)',
  // Common seller spellings that are not on Myntra's list.
  'dusty rose': '#c48f8f',
  'dusty pink': '#d4a5a5',
  blush: '#f4c2c2',
  'powder blue': '#b0d4e8',
};

/**
 * Words a seller puts in front of a colour ("Dusty Rose", "Deep Teal"). When
 * the full name is unknown, the swatch falls back to the base colour rather
 * than a grey placeholder.
 */
const MODIFIERS = new Set([
  'light', 'dark', 'deep', 'pale', 'bright', 'dusty', 'muted', 'soft', 'pastel',
  'neon', 'vivid', 'rich', 'royal', 'warm', 'cool', 'washed', 'faded',
]);

/** Colours that need an outline, or the swatch vanishes against a white card. */
const LIGHT_COLOURS = new Set([
  'white',
  'off white',
  'ivory',
  'cream',
  'beige',
  'tan',
  'khaki',
  'lemon yellow',
  'baby pink',
  'lavender',
  'lilac',
  'light blue',
  'sky blue',
  'mint green',
  'peach',
  'silver',
  'metallic',
  'nude',
  'champagne',
  'grey melange',
  'blush',
  'powder blue',
  'transparent',
]);

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const normalise = (name?: string | null): string =>
  String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const cleanHex = (hex?: string | null): string | null => {
  const value = String(hex ?? '').trim();
  return HEX_RE.test(value) ? value : null;
};

/** Perceived brightness, for deciding whether a stored hex needs an outline. */
const luminance = (hex: string): number => {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

/** A single colour's CSS: the exact name, else the name without its modifier words. */
const singleColour = (key: string): string | null => {
  if (COLOR_MAP[key]) return COLOR_MAP[key];
  const words = key.split(' ');
  const core = words.filter((word) => !MODIFIERS.has(word));
  if (core.length > 0 && core.length < words.length) {
    const base = COLOR_MAP[core.join(' ')];
    if (base) return base;
  }
  // "Bottle Green" → green: the last word is usually the colour family.
  return words.length > 1 ? COLOR_MAP[words[words.length - 1]] ?? null : null;
};

export function colorNameToCss(name?: string | null): string | null {
  const key = normalise(name);
  if (!key) return null;
  if (COLOR_MAP[key]) return COLOR_MAP[key];
  // Two colours in one name ("Pink & Blue", "Black/White") paint half each.
  // Checked before the single-colour fallbacks, which would otherwise read
  // "Pink & Blue" as just blue.
  const parts = key.split(/\s*(?:&|\/|\+|,|\band\b)\s*/).filter(Boolean);
  if (parts.length === 1) return singleColour(key);
  if (parts.length <= 3) {
    const colours = parts.map(singleColour);
    if (colours.every((c): c is string => Boolean(c) && !c!.includes('gradient'))) {
      const step = 100 / colours.length;
      const stops = colours.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(',');
      return `linear-gradient(135deg,${stops})`;
    }
  }
  return null;
}

/** CSS for a colour name, falling back to a neutral rather than nothing. */
export function colourToCss(name?: string | null): string {
  return colorNameToCss(name) ?? 'var(--border-strong)';
}

export function isLightColour(name?: string | null): boolean {
  const key = normalise(name);
  if (LIGHT_COLOURS.has(key)) return true;
  // A resolved hex can still say "pale": outline anything near white.
  const css = colorNameToCss(key);
  return Boolean(css && HEX_RE.test(css) && luminance(css) > 0.82);
}

export interface SwatchStyle {
  style: CSSProperties;
  /** False when the name was not recognised — the swatch is a placeholder. */
  hasColour: boolean;
  isLight: boolean;
}

/** Everything a swatch needs to paint itself, from a colour card. */
export function resolveSwatchStyle(color: SwatchSource): SwatchStyle {
  const hex = cleanHex(color.hex);
  if (hex) {
    return { style: { background: hex }, hasColour: true, isLight: luminance(hex) > 0.72 };
  }

  const byName = colorNameToCss(color.name);
  if (byName) {
    return { style: { background: byName }, hasColour: true, isLight: isLightColour(color.name) };
  }

  return { style: { background: 'var(--border)' }, hasColour: false, isLight: true };
}
