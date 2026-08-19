'use client';

import React from 'react';
import Image from 'next/image';
import { customWearContent, type HeroContent } from '@/config/custom-wear/content';
import { PurchaseModeToggle } from './PurchaseModeToggle';
import type { PurchaseMode } from '@/types/custom-wear';

export interface CustomWearHeroProps {
  mode: PurchaseMode;
  onModeChange: (mode: PurchaseMode) => void;
  /** Overrides for a category landing page; falls back to the global hero copy. */
  content?: Partial<HeroContent>;
  children?: React.ReactNode;
}

/**
 * Top banner. Every visual property — copy, colours, alignment, heights, font
 * sizes, background image — comes from `customWearContent.hero`.
 */
export const CustomWearHero: React.FC<CustomWearHeroProps> = ({
  mode,
  onModeChange,
  content,
  children,
}) => {
  const hero: HeroContent = { ...customWearContent.hero, ...content };
  const isCentered = hero.align === 'center';

  /**
   * The banner is 2.5:1 artwork. Forcing it into a fixed-height box made
   * `object-cover` crop roughly half the image away, cutting off the models.
   * From tablet up the section is instead at least as tall as the image is at
   * full width (`100vw × height/width`), so the whole banner is visible. Below
   * that the viewport is narrower than the artwork and a crop is unavoidable,
   * so the configured focal point keeps the subject in frame.
   */
  const naturalRatio = hero.backgroundHeight / hero.backgroundWidth;
  const naturalHeight = `calc(100vw * ${naturalRatio.toFixed(5)})`;

  const heroCss = `
.cw-hero {
  min-height: ${hero.minHeightMobile};
}
.cw-hero-media {
  object-fit: cover;
  object-position: ${hero.backgroundPositionMobile};
}
@media (min-width: 768px) {
  .cw-hero {
    min-height: max(${hero.minHeightDesktop}, min(${naturalHeight}, ${hero.maxHeightDesktop}));
  }
  .cw-hero-media {
    object-position: ${hero.backgroundPositionDesktop};
  }
}`;

  return (
    <section
      className="cw-hero relative flex w-full overflow-hidden"
      style={{ backgroundColor: hero.backgroundColor }}
    >
      <style dangerouslySetInnerHTML={{ __html: heroCss }} />

      {hero.backgroundImage && (
        <Image
          src={hero.backgroundImage}
          alt=""
          aria-hidden="true"
          fill
          priority
          sizes="100vw"
          className="cw-hero-media"
        />
      )}

      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: hero.overlayColor }}
      />

      <div
        className="relative mx-auto flex w-full flex-col justify-center px-4 py-12 sm:px-6 md:py-16 lg:px-10"
        style={{ maxWidth: 'var(--cw-content-max)' }}
      >
        <div className={isCentered ? 'mx-auto text-center' : 'text-left'}>
          {hero.eyebrow && (
            <p
              className="mb-3 uppercase"
              style={{
                color: 'var(--cw-primary)',
                fontFamily: 'var(--cw-font-body)',
                fontSize: 'var(--cw-fs-micro)',
                fontWeight: 600,
                letterSpacing: '0.22em',
              }}
            >
              {hero.eyebrow}
            </p>
          )}

          <h1
            style={{
              color: hero.headingColor,
              fontFamily: 'var(--cw-font-heading)',
              fontSize: hero.headingFontSize,
              lineHeight: 1.05,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            {hero.heading}
          </h1>

          <p
            className="mt-4"
            style={{
              color: hero.textColor,
              fontFamily: 'var(--cw-font-body)',
              fontSize: hero.descriptionFontSize,
              lineHeight: 1.6,
              maxWidth: hero.descriptionMaxWidth,
              marginLeft: isCentered ? 'auto' : undefined,
              marginRight: isCentered ? 'auto' : undefined,
            }}
          >
            {hero.description}
          </p>

          <div className={`mt-7 flex ${isCentered ? 'justify-center' : 'justify-start'}`}>
            <PurchaseModeToggle mode={mode} onChange={onModeChange} variant="hero" />
          </div>

          {children}
        </div>
      </div>
    </section>
  );
};
