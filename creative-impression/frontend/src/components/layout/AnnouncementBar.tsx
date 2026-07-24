'use client';

import React from 'react';

export type AnnouncementFontFamily = 'montserrat' | 'playfair' | 'inter' | (string & {});
export type AnnouncementFontWeight = 'normal' | 'bold';

export interface AnnouncementBarProps {
  message?: string;
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: AnnouncementFontFamily;
  fontSize?: string;
  fontSizeMd?: string;
  fontWeight?: AnnouncementFontWeight;
  isDismissible?: boolean;
}

/** Edit these defaults to change announcement bar styling site-wide. */
export const ANNOUNCEMENT_BAR_DEFAULTS = {
  message: 'FREE SHIPPING ON ORDERS OVER ₹999 • CUSTOMIZE YOUR PROFESSIONAL WEAR • B2B WHOLESALE PRICING',
  backgroundColor: '#FBB602',
  textColor: '#000000',
  fontFamily: 'montserrat' as AnnouncementFontFamily,
  fontSize: '10px',
  fontSizeMd: '12px',
  fontWeight: 'bold' as AnnouncementFontWeight,
};

const FONT_FAMILY_MAP: Record<string, string> = {
  montserrat: 'var(--font-montserrat)',
  playfair: 'var(--font-playfair)',
  inter: 'Inter, sans-serif',
};

const resolveFontFamily = (fontFamily: AnnouncementFontFamily): string =>
  FONT_FAMILY_MAP[fontFamily] ?? fontFamily;

const resolveFontWeight = (fontWeight: AnnouncementFontWeight): number =>
  fontWeight === 'bold' ? 700 : 400;

export const AnnouncementBar: React.FC<AnnouncementBarProps> = ({
  message = ANNOUNCEMENT_BAR_DEFAULTS.message,
  backgroundColor = ANNOUNCEMENT_BAR_DEFAULTS.backgroundColor,
  textColor = ANNOUNCEMENT_BAR_DEFAULTS.textColor,
  fontFamily = ANNOUNCEMENT_BAR_DEFAULTS.fontFamily,
  fontSize = ANNOUNCEMENT_BAR_DEFAULTS.fontSize,
  fontSizeMd = ANNOUNCEMENT_BAR_DEFAULTS.fontSizeMd,
  fontWeight = ANNOUNCEMENT_BAR_DEFAULTS.fontWeight,
  isDismissible = false,
}) => {
  const [isDismissed, setIsDismissed] = React.useState(false);

  if (isDismissed) return null;

  const textStyle: React.CSSProperties = {
    color: textColor,
    fontFamily: resolveFontFamily(fontFamily),
    fontSize: `clamp(${fontSize}, 1.2vw, ${fontSizeMd})`,
    fontWeight: resolveFontWeight(fontWeight),
  };

  return (
    <div
      className="w-full overflow-x-hidden px-2 py-1.5 text-center md:px-4"
      style={{ backgroundColor }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <p className="flex-1 uppercase line-clamp-1 md:line-clamp-none" style={textStyle}>
          {message}
        </p>
        {isDismissible && (
          <button
            onClick={() => setIsDismissed(true)}
            className="ml-4 flex-shrink-0 hover:opacity-80"
            aria-label="Close announcement"
            style={{ color: textColor }}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
