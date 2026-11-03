import React from 'react';
import type { IconProps } from './icons';

/**
 * Accent tones for the admin console.
 *
 * The console is neutral by default: grey canvas, white cards, ink text and
 * buttons. Colour is reserved for two jobs, and only in small doses — icon
 * chips, status dots, sparklines and the selected sidebar icon:
 *
 *  - wayfinding: each area of the console keeps one hue everywhere it shows
 *    up (sidebar, shortcuts, dashboard), so "green" comes to mean orders and
 *    money without anyone reading a label;
 *  - status: good / warning / critical, from the separate status tokens.
 *
 * Values live in styles/tokens.css (`--a-tone-<name>-fg|bg|solid`).
 */
export type Tone = 'blue' | 'green' | 'amber' | 'violet' | 'teal' | 'rose' | 'neutral';

/** One hue per area of the console. */
export const AREA_TONES = {
  overview: 'violet',
  catalogue: 'blue',
  orders: 'green',
  marketplace: 'amber',
  customers: 'teal',
  content: 'rose',
} as const satisfies Record<string, Tone>;

export type Area = keyof typeof AREA_TONES;

/** The solid colour of a tone, for charts and sparklines. */
export const toneSolid = (tone: Tone): string =>
  tone === 'neutral' ? 'var(--a-text-faint)' : `var(--a-tone-${tone}-solid)`;

/** A tinted square holding a coloured icon. The one place a card gets colour. */
export function ToneIcon({
  icon: Icon,
  tone,
  size = 'md',
}: {
  icon: React.FC<IconProps>;
  tone: Tone;
  size?: 'sm' | 'md';
}) {
  return (
    <span className="a-tone-icon" data-tone={tone} data-size={size} aria-hidden="true">
      <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2} />
    </span>
  );
}

/** A small coloured dot that marks a figure or a row with its tone. */
export function ToneDot({ tone }: { tone: Tone }) {
  return <span className="a-tone-dot" data-tone={tone} aria-hidden="true" />;
}
