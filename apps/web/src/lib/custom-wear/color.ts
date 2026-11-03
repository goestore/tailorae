/**
 * Colour maths for garment previews.
 *
 * Custom Wear renders the same garment in any of a dozen stock colours, so
 * nothing drawn on top of it — outlines, print-area boxes, labels — can use a
 * fixed colour: a grey dashed box vanishes on black, and a white garment on the
 * near-white panel background disappears without a darker outline.
 */

/** Perceived brightness, 0–255, using the standard weighted RGB formula. */
export function brightness(hex: string): number {
  const value = hex.replace('#', '').trim();
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  if (full.length !== 6) return 255;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return 255;
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/** True when text and outlines need to be dark to stay legible on this colour. */
export function isLightColor(hex: string | undefined): boolean {
  if (!hex) return true;
  return brightness(hex) > 165;
}

/** Ink that reads against `hex` — near-black on light garments, white on dark. */
export function contrastInk(hex: string | undefined): string {
  return isLightColor(hex) ? '#111111' : '#FFFFFF';
}

/**
 * A translucent version of the contrasting ink, for outlines that should be
 * visible without competing with the artwork placed inside them.
 */
export function contrastLine(hex: string | undefined, alpha = 0.55): string {
  return isLightColor(hex) ? `rgba(17,17,17,${alpha})` : `rgba(255,255,255,${alpha})`;
}
