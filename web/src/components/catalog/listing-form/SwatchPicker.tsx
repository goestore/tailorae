'use client';

import React from 'react';
import { resolveSwatchStyle } from '@/lib/color-map';
import { suggestColourFamily } from '@/lib/products-api';

/**
 * The swatch a shopper sees beside the product name on its card, chosen per
 * colour. "Dusty Rose" or "Mehendi" cannot be guessed from the name, so the
 * seller picks the actual shade; a colour left alone falls back to that guess.
 */

/** Common garment shades, one tap each. The colour wheel covers the rest. */
const PRESETS: Array<{ name: string; hex: string }> = [
  { name: 'Black', hex: '#1A1A1A' },
  { name: 'White', hex: '#F8F8F8' },
  { name: 'Off white', hex: '#F2EEE3' },
  { name: 'Grey', hex: '#8C8C8C' },
  { name: 'Navy', hex: '#1F2A44' },
  { name: 'Blue', hex: '#2F5DA8' },
  { name: 'Sky blue', hex: '#8EC5E8' },
  { name: 'Teal', hex: '#1F7A7A' },
  { name: 'Green', hex: '#2E7D4F' },
  { name: 'Olive', hex: '#6B6B2E' },
  { name: 'Yellow', hex: '#E9B600' },
  { name: 'Mustard', hex: '#C99A2E' },
  { name: 'Orange', hex: '#E0702B' },
  { name: 'Red', hex: '#C62828' },
  { name: 'Maroon', hex: '#6D1B2A' },
  { name: 'Pink', hex: '#F28AB2' },
  { name: 'Peach', hex: '#F6B89A' },
  { name: 'Purple', hex: '#6A3D9A' },
  { name: 'Lavender', hex: '#B9A6DE' },
  { name: 'Brown', hex: '#7B4A2A' },
  { name: 'Beige', hex: '#D9C4A3' },
];

const HEX_RE = /^#[0-9a-f]{6}$/i;

interface SwatchPickerProps {
  /** The colours this listing is sold in. */
  colours: string[];
  hexes: Record<string, string>;
  onChange: (colour: string, hex: string | null) => void;
  /** The fixed colour-family list, and each colour's chosen family. */
  families: Array<{ name: string; hex: string }>;
  chosenFamilies: Record<string, string>;
  onFamily: (colour: string, family: string | null) => void;
  /** A suggestion: applied only if the colour still has no family. */
  onSuggested: (colour: string, family: string) => void;
}

export const SwatchPicker: React.FC<SwatchPickerProps> = ({
  colours,
  hexes,
  onChange,
  families,
  chosenFamilies,
  onFamily,
  onSuggested,
}) => {
  const names = colours.map((c) => c.trim()).filter(Boolean);

  // A colour typed without a family gets one suggested from its name (and
  // swatch), so "Dusty Rose" arrives filed under Rose. The seller can change
  // it; asked once per colour name.
  const asked = React.useRef(new Set<string>());
  React.useEffect(() => {
    for (const name of names) {
      if (chosenFamilies[name] || asked.current.has(name)) continue;
      asked.current.add(name);
      suggestColourFamily(name, hexes[name])
        .then((family) => {
          if (family) onSuggested(name, family);
        })
        .catch(() => undefined);
    }
  });

  if (names.length === 0) return null;

  return (
    <div className="lf-field lf-field--wide">
      <span className="lf-label">Colour family and swatch</span>
      <p className="lf-hint" style={{ marginTop: 0 }}>
        The family is what shoppers filter by, so “Dusty Rose” is found under Rose. It is suggested
        from the name; check it. The swatch is the square beside the product name on its card.
      </p>
      <div className="flex flex-col gap-3">
        {names.map((name) => {
          const chosen = hexes[name] ?? null;
          // No shade of their own: the family's canonical one, else the name guess.
          const familyHex = families.find((f) => f.name === chosenFamilies[name])?.hex ?? null;
          const swatch = resolveSwatchStyle({ name, hex: chosen ?? familyHex });
          return (
            <div
              key={name}
              className="flex flex-wrap items-center gap-3 p-3"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
            >
              <div className="flex min-w-[10rem] items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-8 w-8 shrink-0"
                  style={{
                    ...swatch.style,
                    borderRadius: 4,
                    border: swatch.isLight ? '1px solid var(--border-strong)' : '1px solid transparent',
                  }}
                />
                <span className="flex flex-col">
                  <span className="text-[13px] font-semibold text-ink">{name}</span>
                  <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                    {chosen ?? (familyHex ? `${chosenFamilies[name]} shade` : swatch.hasColour ? 'Guessed from name' : 'No match — pick a shade')}
                  </span>
                </span>
              </div>

              <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--ink-3)' }}>
                <span>
                  Colour family <span className="lf-req">Required</span>
                </span>
                <select
                  className="lf-input min-w-[9.5rem] text-[13px]"
                  aria-label={`Colour family for ${name}`}
                  value={chosenFamilies[name] ?? ''}
                  aria-invalid={!chosenFamilies[name] || undefined}
                  onChange={(e) => onFamily(name, e.target.value || null)}
                >
                  <option value="">Choose…</option>
                  {families.map((family) => (
                    <option key={family.name} value={family.name}>
                      {family.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Shades for ${name}`}>
                {PRESETS.map((preset) => {
                  const active = chosen?.toUpperCase() === preset.hex;
                  return (
                    <button
                      key={preset.hex}
                      type="button"
                      title={preset.name}
                      aria-label={`${preset.name} for ${name}`}
                      aria-pressed={active}
                      onClick={() => onChange(name, preset.hex)}
                      className="h-6 w-6 transition-transform hover:scale-110"
                      style={{
                        background: preset.hex,
                        borderRadius: 3,
                        border: active ? '2px solid var(--ink)' : '1px solid var(--border-strong)',
                        outline: active ? '1px solid var(--surface)' : undefined,
                        outlineOffset: -3,
                      }}
                    />
                  );
                })}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <input
                  type="color"
                  aria-label={`Any shade for ${name}`}
                  value={chosen ?? '#888888'}
                  onChange={(e) => onChange(name, e.target.value.toUpperCase())}
                  className="h-8 w-10 cursor-pointer p-0.5"
                  style={{ border: '1px solid var(--border-strong)', background: 'var(--surface)' }}
                />
                {/* Uncontrolled while typing (a half-typed "#1F2" is not a
                    colour yet); committed when complete or on blur. */}
                <input
                  key={chosen ?? 'auto'}
                  type="text"
                  aria-label={`Hex code for ${name}`}
                  defaultValue={chosen ?? ''}
                  placeholder="#RRGGBB"
                  maxLength={7}
                  onChange={(e) => {
                    const value = e.target.value.trim();
                    if (HEX_RE.test(value)) onChange(name, value.toUpperCase());
                  }}
                  onBlur={(e) => {
                    if (e.target.value.trim() === '' && chosen) onChange(name, null);
                  }}
                  className="lf-input w-[6.5rem] font-mono text-[12px]"
                />
                {chosen && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(name, null)}>
                    Auto
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
