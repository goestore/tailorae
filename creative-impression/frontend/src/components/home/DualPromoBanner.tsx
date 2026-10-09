import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

/**
 * The two-panel hero at the top of the home page.
 *
 * Every piece of copy is optional and comes from the content schema, and the
 * overlay only renders when there is something to say. That default matters:
 * the banners uploaded today are marketing artwork with their own headline and
 * strapline already burned into the image, so an overlay would print a second
 * headline across the first. The fields exist for the day a plain photograph
 * is uploaded instead, which is the more usual case and the one where a hero
 * with no words tells a first-time visitor nothing about what the shop sells.
 */

interface BannerItem {
  image: string;
  href?: string;
  alt?: string;
  /** The small line above the headline. */
  eyebrow?: string;
  heading?: string;
  /** Button label. Only shown when the panel is a link. */
  cta?: string;
}

interface DualPromoBannerProps {
  left: BannerItem;
  right: BannerItem;
  divider?: number;
  className?: string;
  aspectRatio?: string;
}

const isExternalUrl = (url?: string) => url?.startsWith('http') ?? false;

export const DualPromoBanner: React.FC<DualPromoBannerProps> = ({
  left,
  right,
  divider = 0,
  className = '',
  aspectRatio = 'aspect-video',
}) => {
  const renderBanner = (item: BannerItem, index: number) => {
    const hasCopy = Boolean(item.eyebrow || item.heading || (item.cta && item.href));

    const imageElement = (
      <div className={`group relative w-full ${aspectRatio} overflow-hidden`}>
        {/* No hover transform here: this is the LCP element, and scaling it
            forces a composited layer for the largest paint on the page. */}
        <Image
          src={item.image}
          alt={item.alt || ''}
          width={1200}
          height={675}
          sizes="(max-width: 768px) 100vw, 50vw"
          className="h-full w-full object-cover"
          priority={index === 0}
          fetchPriority={index === 0 ? 'high' : 'auto'}
        />

        {hasCopy && (
          <>
            {/* A scrim rather than a flat tint: these are photographs the shop
                changes from the admin, and white text has to stay legible over
                whichever one is uploaded next. Weighted to the bottom, where
                the copy sits, so the subject of the picture stays clear. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.28) 34%, rgba(0,0,0,0) 62%)',
              }}
            />

            <div className="absolute inset-x-0 bottom-0 p-5 md:p-8 lg:p-10">
              {item.eyebrow && (
                <p className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/80">
                  {item.eyebrow}
                </p>
              )}
              {item.heading && (
                <h2
                  className="m-0 mt-2 text-white"
                  style={{
                    fontSize: 'clamp(22px, 3.2vw, 40px)',
                    lineHeight: 1.05,
                    letterSpacing: '-0.03em',
                  }}
                >
                  {item.heading}
                </h2>
              )}
              {item.cta && item.href && (
                <span
                  className="mt-4 inline-flex items-center gap-2 border border-white/70 px-5 py-2.5 text-[13px] font-medium text-white transition-colors group-hover:bg-white group-hover:text-ink"
                >
                  {item.cta}
                  <span aria-hidden="true">&rarr;</span>
                </span>
              )}
            </div>
          </>
        )}
      </div>
    );

    if (!item.href) return imageElement;

    if (isExternalUrl(item.href)) {
      return (
        <a href={item.href} target="_blank" rel="noopener noreferrer" className="block w-full">
          {imageElement}
        </a>
      );
    }

    return (
      <Link href={item.href} className="block w-full">
        {imageElement}
      </Link>
    );
  };

  return (
    // Edge-to-edge on phones, but capped at the site content width so it lines
    // up with every other band on a large monitor instead of sprawling.
    <section className={`mx-auto w-full max-w-content ${className}`}>
      <div className="flex flex-col md:flex-row" style={{ gap: divider }}>
        {[left, right].map((item, index) => (
          <div key={index} className="w-full md:w-1/2">
            {renderBanner(item, index)}
          </div>
        ))}
      </div>
    </section>
  );
};
