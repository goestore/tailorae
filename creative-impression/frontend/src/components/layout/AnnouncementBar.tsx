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
  /** Show the dismiss ("cut") control. */
  isDismissible?: boolean;
  /** Scroll the message as a ticker, with a pause control. */
  scroll?: boolean;
  /** Seconds for one full pass. */
  speed?: number;
}

/** Edit these defaults to change announcement bar styling site-wide. */
export const ANNOUNCEMENT_BAR_DEFAULTS = {
  message:
    'FREE SHIPPING ON ORDERS OVER ₹999 • CUSTOMIZE YOUR PROFESSIONAL WEAR • B2B WHOLESALE PRICING',
  /** Any colour, or the sentinel 'ink' for the site's dark gradient. */
  backgroundColor: '#FFFFFF',
  /** Softer than full ink — this is a utility strip, not a headline. */
  textColor: '#52525b',
  fontFamily: 'montserrat' as AnnouncementFontFamily,
  fontSize: '9px',
  fontSizeMd: '10px',
  fontWeight: 'normal' as AnnouncementFontWeight,
};

const FONT_FAMILY_MAP: Record<string, string> = {
  montserrat: 'var(--font-inter), system-ui, sans-serif',
  playfair: 'var(--font-inter), system-ui, sans-serif',
  inter: 'var(--font-inter), system-ui, sans-serif',
};

const resolveFontFamily = (fontFamily: AnnouncementFontFamily): string =>
  FONT_FAMILY_MAP[fontFamily] ?? fontFamily;

// 500 rather than 400 for 'normal': small uppercase type needs a little weight
// to stay crisp, but 700 read as shouty at this size.
const resolveFontWeight = (fontWeight: AnnouncementFontWeight): number =>
  fontWeight === 'bold' ? 600 : 500;

/** Splits on the bullet so the separators can carry the brand colour. */
const renderMessage = (message: string) =>
  message.split('•').map((part, i) => (
    <React.Fragment key={i}>
      {i > 0 && <span style={{ color: 'var(--brand)' }}>•</span>}
      {part}
    </React.Fragment>
  ));

export const AnnouncementBar: React.FC<AnnouncementBarProps> = ({
  message = ANNOUNCEMENT_BAR_DEFAULTS.message,
  backgroundColor = ANNOUNCEMENT_BAR_DEFAULTS.backgroundColor,
  textColor = ANNOUNCEMENT_BAR_DEFAULTS.textColor,
  fontFamily = ANNOUNCEMENT_BAR_DEFAULTS.fontFamily,
  fontSize = ANNOUNCEMENT_BAR_DEFAULTS.fontSize,
  fontSizeMd = ANNOUNCEMENT_BAR_DEFAULTS.fontSizeMd,
  fontWeight = ANNOUNCEMENT_BAR_DEFAULTS.fontWeight,
  isDismissible = true,
  scroll = true,
  speed = 32,
}) => {
  const [isDismissed, setIsDismissed] = React.useState(false);
  const [isPaused, setIsPaused] = React.useState(false);

  if (isDismissed) return null;

  const textStyle: React.CSSProperties = {
    color: textColor,
    fontFamily: resolveFontFamily(fontFamily),
    fontSize: `clamp(${fontSize}, 1.2vw, ${fontSizeMd})`,
    fontWeight: resolveFontWeight(fontWeight),
  };

  const controlStyle: React.CSSProperties = { color: textColor };

  return (
    <div
      className="w-full border-b border-line"
      style={{ background: backgroundColor === 'ink' ? 'var(--grad-ink)' : backgroundColor }}
    >
      <div className="container-fluid flex items-center gap-2 py-1">
        {/* Ticker. The track holds two copies of the message so the loop is
            seamless; it is translated by -50%, i.e. exactly one copy. */}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {scroll ? (
            <div
              className="announce-track flex w-max items-center gap-10 whitespace-nowrap uppercase tracking-wide"
              style={{
                ...textStyle,
                animationDuration: `${speed}s`,
                animationPlayState: isPaused ? 'paused' : 'running',
              }}
            >
              <span aria-hidden={false}>{renderMessage(message)}</span>
              <span aria-hidden="true">{renderMessage(message)}</span>
            </div>
          ) : (
            <p className="truncate uppercase tracking-wide" style={textStyle}>
              {renderMessage(message)}
            </p>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-0.5">
          {scroll && (
            <button
              type="button"
              suppressHydrationWarning
              onClick={() => setIsPaused((v) => !v)}
              aria-pressed={isPaused}
              aria-label={isPaused ? 'Resume announcements' : 'Pause announcements'}
              title={isPaused ? 'Resume' : 'Pause'}
              className="flex h-5 w-5 items-center justify-center rounded-full opacity-60 transition-opacity hover:opacity-100"
              style={controlStyle}
            >
              {isPaused ? (
                <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                  <path d="M3 1.8v8.4l7-4.2z" />
                </svg>
              ) : (
                <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                  <rect x="2.5" y="1.8" width="2.6" height="8.4" rx="0.7" />
                  <rect x="6.9" y="1.8" width="2.6" height="8.4" rx="0.7" />
                </svg>
              )}
            </button>
          )}

          {isDismissible && (
            <button
              type="button"
              suppressHydrationWarning
              onClick={() => setIsDismissed(true)}
              aria-label="Dismiss announcement"
              title="Dismiss"
              className="flex h-5 w-5 items-center justify-center rounded-full opacity-60 transition-opacity hover:opacity-100"
              style={controlStyle}
            >
              <svg
                className="h-2.5 w-2.5"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
