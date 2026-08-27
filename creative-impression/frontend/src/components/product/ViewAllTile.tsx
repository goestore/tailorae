import React from 'react';
import Link from 'next/link';

export interface ViewAllTileProps {
  href: string;
  label: string;
  className?: string;
}

/**
 * The last cell of a product row — "see everything", sitting where the eye
 * lands once the row runs out.
 *
 * Deliberately not a card: no border, no fill. It occupies a card's slot but
 * reads as open space with a mark in it, so it closes the row without competing
 * with the products. No `h-full` either — a set height cancels the flex
 * `stretch` that centres it against the cards beside it.
 */
export const ViewAllTile: React.FC<ViewAllTileProps> = ({ href, label, className = '' }) => (
  <Link
    href={href}
    className={`group flex flex-col items-center justify-center gap-4 px-4 text-center no-underline ${className}`.trim()}
  >
    <span
      className="flex h-12 w-12 items-center justify-center rounded-full border border-line-strong text-ink transition-colors group-hover:border-primary-500"
      aria-hidden="true"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M5 12h14M13 6l6 6-6 6"
        />
      </svg>
    </span>
    <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-2 transition-colors group-hover:text-ink">
      {label}
    </span>
  </Link>
);
