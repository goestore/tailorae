import React from 'react';
import Image from 'next/image';
import { cn } from '@/utils/helpers';
import { SITE_NAME } from '@/config/site';

/**
 * The TAILORAE logo, in its three lockups.
 *
 * - `wordmark` — "TAILORAE" set flat. Navigation bars and anywhere space is
 *   wide and short.
 * - `monogram` — the tk mark above the wordmark. Footers, sign-in, empty and
 *   error pages: places with room to show the full identity.
 * - `mark` — the tk mark in its gold ring. Square and circular spots: avatars,
 *   the admin tile, favicons (those are generated files in `app/`).
 *
 * `tone="light"` swaps the black ink for white so the logo reads on dark
 * surfaces; the gold never changes. The files are transparent PNGs in
 * `public/brand/`, regenerated from the master artwork rather than edited.
 *
 * Size it with a height class (`h-5`, `md:h-6`) — the width follows the
 * artwork's proportions.
 */
type Variant = 'wordmark' | 'monogram' | 'mark';

/**
 * `sizes` is the widest the lockup is ever drawn (CSS px). Without it the
 * browser is offered widths for the artwork's own size, and fetched a 1920 px
 * wordmark — 3840 on a retina screen — to show it 220 px wide.
 */
const ASSETS: Record<Variant, { dark: string; light: string; width: number; height: number; sizes: string }> = {
  wordmark: {
    dark: '/brand/tailorae-wordmark@2x.png',
    light: '/brand/tailorae-wordmark-light.png',
    width: 1752,
    height: 192,
    sizes: '224px',
  },
  monogram: {
    dark: '/brand/tailorae-monogram.png',
    light: '/brand/tailorae-monogram-light.png',
    width: 720,
    height: 426,
    sizes: '240px',
  },
  // The ring has its own white face, so one file serves both tones.
  mark: { dark: '/brand/tailorae-mark.png', light: '/brand/tailorae-mark.png', width: 512, height: 512, sizes: '64px' },
};

export interface LogoProps {
  variant?: Variant;
  tone?: 'dark' | 'light';
  /** Height classes; defaults to `h-6`. */
  className?: string;
  /** Empty when a visible label next to the logo already names the store. */
  alt?: string;
  priority?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
  variant = 'wordmark',
  tone = 'dark',
  className,
  alt = SITE_NAME,
  priority,
}) => {
  const asset = ASSETS[variant];
  return (
    <Image
      src={tone === 'light' ? asset.light : asset.dark}
      alt={alt}
      width={asset.width}
      height={asset.height}
      sizes={asset.sizes}
      priority={priority}
      className={cn('block w-auto max-w-none select-none', className ?? 'h-6')}
      draggable={false}
    />
  );
};
