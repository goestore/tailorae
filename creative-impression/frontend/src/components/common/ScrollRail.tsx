'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';

export interface ScrollRailProps {
  /** Names the row in the arrow buttons' accessible labels, e.g. "best selling". */
  label: string;
  children: React.ReactNode;
}

/**
 * Horizontal snap row with edge arrows that only appear when there is more to
 * see in that direction. Every product/category rail on the site uses this, so
 * the scroll bookkeeping lives here instead of being copied per section.
 *
 * Items size themselves — pass `pcard-fixed snap-start` (or `ctile`) on each
 * child. The gap is driven by `--card-gap`, the same token the card width math
 * uses, so a row always holds a whole number of cards.
 */
export const ScrollRail: React.FC<ScrollRailProps> = ({ label, children }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 1;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > threshold);
    setCanScrollRight(maxScrollLeft - el.scrollLeft > threshold);
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    checkScroll();

    const handleScroll = () => checkScroll();
    const handleResize = () => checkScroll();

    el.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const scrollByAmount = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.7;
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      {/* The bottom padding clears the cards' hover glow: overflow-x forces
          overflow-y to auto as well, so whatever the shadow casts below a card
          gets clipped without room left for it. */}
      <div
        ref={scrollRef}
        className="flex snap-x snap-mandatory gap-[var(--card-gap)] overflow-x-auto scroll-smooth pb-6 scrollbar-hide touch-pan-x"
      >
        {children}
      </div>

      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByAmount('left')}
          className="absolute left-2 top-[38%] z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white/95 shadow-2 transition-colors hover:bg-surface-2 md:flex lg:left-4"
          aria-label={`Scroll ${label} left`}
        >
          <svg className="h-4 w-4 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByAmount('right')}
          className="absolute right-2 top-[38%] z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white/95 shadow-2 transition-colors hover:bg-surface-2 md:flex lg:right-4"
          aria-label={`Scroll ${label} right`}
        >
          <svg className="h-4 w-4 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
};
