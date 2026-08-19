'use client';

import React, { useState } from 'react';

export interface QuantitySelectorProps {
  quantity: number;
  minQuantity: number;
  onChange: (quantity: number) => void;
  /** Jump-to quantities taken from the product's price tiers. */
  presets?: number[];
  step?: number;
}

/**
 * Quantity stepper with typed entry and tier shortcuts.
 *
 * The input is only clamped on blur so a buyer can clear it and type a new
 * number without it snapping back mid-edit.
 */
export const QuantitySelector: React.FC<QuantitySelectorProps> = ({
  quantity,
  minQuantity,
  onChange,
  presets = [],
  step = 1,
}) => {
  const [draft, setDraft] = useState(String(quantity));

  // Mirror externally-driven changes (tier shortcuts, mode reset) during render.
  const [syncedQuantity, setSyncedQuantity] = useState(quantity);
  if (syncedQuantity !== quantity) {
    setSyncedQuantity(quantity);
    setDraft(String(quantity));
  }

  const commit = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    const next = Number.isFinite(parsed) ? Math.max(minQuantity, parsed) : minQuantity;
    setDraft(String(next));
    if (next !== quantity) onChange(next);
  };

  const adjust = (delta: number) => onChange(Math.max(minQuantity, quantity + delta));

  return (
    <section>
      <h3
        className="mb-2.5"
        style={{
          margin: '0 0 10px',
          fontFamily: 'var(--cw-font-body)',
          fontSize: 'var(--cw-fs-small)',
          fontWeight: 700,
          color: 'var(--cw-ink)',
        }}
      >
        Quantity
        {minQuantity > 1 && (
          <span style={{ fontWeight: 400, color: 'var(--cw-ink-subtle)' }}>
            {' '}
            · minimum {minQuantity}
          </span>
        )}
      </h3>

      <div className="flex flex-wrap items-center gap-3">
        <div
          className="inline-flex items-stretch overflow-hidden"
          style={{ border: '1px solid var(--cw-border)', borderRadius: 'var(--cw-radius-control)' }}
        >
          <button
            suppressHydrationWarning
            type="button"
            onClick={() => adjust(-step)}
            disabled={quantity <= minQuantity}
            aria-label="Decrease quantity"
            className="flex w-11 items-center justify-center transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-35"
            style={{ color: 'var(--cw-ink)', fontSize: '18px', fontWeight: 600 }}
          >
            −
          </button>
          <label className="sr-only" htmlFor="cw-quantity">
            Quantity
          </label>
          <input
            suppressHydrationWarning
            id="cw-quantity"
            type="number"
            inputMode="numeric"
            min={minQuantity}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => commit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit((event.target as HTMLInputElement).value);
            }}
            className="w-[84px] text-center"
            style={{
              border: 'none',
              borderLeft: '1px solid var(--cw-border)',
              borderRight: '1px solid var(--cw-border)',
              borderRadius: 0,
              fontWeight: 700,
              fontSize: 'var(--cw-fs-body)',
            }}
          />
          <button
            suppressHydrationWarning
            type="button"
            onClick={() => adjust(step)}
            aria-label="Increase quantity"
            className="flex w-11 items-center justify-center transition-colors hover:bg-neutral-50"
            style={{ color: 'var(--cw-ink)', fontSize: '18px', fontWeight: 600 }}
          >
            +
          </button>
        </div>

        {presets.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <button
                suppressHydrationWarning
                key={preset}
                type="button"
                onClick={() => onChange(Math.max(minQuantity, preset))}
                aria-pressed={quantity === preset}
                className="transition-colors hover:bg-neutral-50"
                style={{
                  fontFamily: 'var(--cw-font-body)',
                  fontSize: 'var(--cw-fs-micro)',
                  fontWeight: 600,
                  padding: '7px 10px',
                  borderRadius: 'var(--cw-radius-chip)',
                  border: `1px solid ${quantity === preset ? 'var(--cw-primary)' : 'var(--cw-border)'}`,
                  backgroundColor:
                    quantity === preset ? 'var(--cw-primary-soft)' : 'var(--cw-white)',
                  color: 'var(--cw-ink-muted)',
                }}
              >
                {preset}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
