import React from 'react';

/**
 * Line icons drawn on the same 24px grid with the same stroke weight, so a row
 * of them reads as one set. They replace the emoji the marketing sections used
 * to render, which picked up whatever glyph the visitor's OS happened to ship —
 * a different colour, weight, and style on every machine.
 *
 * Unknown names render nothing rather than throwing, so a typo costs an icon
 * and not the page.
 */
const ICONS: Record<string, React.ReactNode> = {
  // Premium quality — a four-point sparkle with a smaller one trailing it.
  sparkle: (
    <>
      <path d="M11 4l1.7 4.8L17.5 10.5l-4.8 1.7L11 17l-1.7-4.8L4.5 10.5l4.8-1.7L11 4z" />
      <path d="M18 14.5l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6.6-1.7z" />
    </>
  ),
  // Fast delivery.
  truck: (
    <>
      <path d="M3 6.5h10.5v9H3z" />
      <path d="M13.5 9.5h3.4l2.6 3v3h-6z" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </>
  ),
  // Competitive pricing.
  tag: (
    <>
      <path d="M3.5 3.5h7.4l9.6 9.6-7.4 7.4L3.5 10.9z" />
      <circle cx="7.6" cy="7.6" r="1.4" />
    </>
  ),
  // Custom printing.
  printer: (
    <>
      <path d="M7.5 9.5v-5h9v5" />
      <path d="M4.5 9.5h15v6h-3" />
      <path d="M7.5 9.5h-3v6h3" />
      <path d="M7.5 13.5h9v6h-9z" />
    </>
  ),
  // B2B wholesale.
  building: (
    <>
      <path d="M4.5 20.5v-16h9v16" />
      <path d="M13.5 20.5v-9h6v9" />
      <path d="M7.5 8h3M7.5 11.5h3M7.5 15h3M16 15h1" />
    </>
  ),
  // Ready-to-wear.
  tshirt: (
    <path d="M8.5 3.5L4 6l-1 3.5 3.5 1.5v9.5h11V11l3.5-1.5L20 6l-4.5-2.5a3.5 3.5 0 01-7 0z" />
  ),
  // Design services.
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 000 17c1.1 0 2-.9 2-2 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1.1.9-2 2-2h1.7a3.8 3.8 0 003.8-3.8c0-3.7-3.8-6.7-8.5-6.7z" />
      <circle cx="7.8" cy="11.5" r="1.1" />
      <circle cx="11" cy="7.8" r="1.1" />
      <circle cx="15.2" cy="9.6" r="1.1" />
    </>
  ),
  // Fashion manufacturing — the cut-and-sew work behind the catalog.
  sewing: (
    <>
      <path d="M7 6.5h10.5a2 2 0 012 2v8" />
      <path d="M7 6.5V13" />
      <path d="M5.9 13h2.2" />
      <path d="M7 13v2" />
      <circle cx="17" cy="11" r="1.5" />
      <path d="M3.5 16.5h17v3.5h-17z" />
    </>
  ),
  heart: (
    <path d="M12 20.2s-7-4.3-7-9.2a3.9 3.9 0 017-2.4 3.9 3.9 0 017 2.4c0 4.9-7 9.2-7 9.2z" />
  ),
};

/**
 * Every icon this set can draw.
 *
 * Exported so the content registry can offer exactly these as a choice: a
 * dropdown built from the set itself cannot drift from it, and an icon field
 * can never be saved with a name that renders nothing.
 */
export const ICON_NAMES = Object.keys(ICONS) as readonly string[];

export interface IconProps {
  /** Key from the set above, e.g. "truck". */
  name: string;
  className?: string;
}

export const Icon: React.FC<IconProps> = ({ name, className = 'h-7 w-7' }) => {
  const paths = ICONS[name];
  if (!paths) return null;

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
};
