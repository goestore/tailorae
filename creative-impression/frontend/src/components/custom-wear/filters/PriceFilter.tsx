'use client';

import React, { useState } from 'react';

export interface PriceFilterProps {
  bounds: { min: number; max: number };
  minPrice: number | null;
  maxPrice: number | null;
  onChange: (min: number | null, max: number | null) => void;
  currencySymbol?: string;
}

/**
 * Min/max price control: a dual range slider plus number inputs, because a
 * slider alone is hard to use precisely and impossible on a keyboard-only
 * device without a stated value.
 */
export const PriceFilter: React.FC<PriceFilterProps> = ({
  bounds,
  minPrice,
  maxPrice,
  onChange,
  currencySymbol = '₹',
}) => {
  const floor = Math.floor(bounds.min);
  const ceiling = Math.ceil(bounds.max);

  const [localMin, setLocalMin] = useState(minPrice ?? floor);
  const [localMax, setLocalMax] = useState(maxPrice ?? ceiling);

  // Re-sync during render when the committed range changes (Clear All, chips).
  const committedKey = `${minPrice ?? floor}:${maxPrice ?? ceiling}`;
  const [syncedKey, setSyncedKey] = useState(committedKey);
  if (syncedKey !== committedKey) {
    setSyncedKey(committedKey);
    setLocalMin(minPrice ?? floor);
    setLocalMax(maxPrice ?? ceiling);
  }

  const commit = (nextMin: number, nextMax: number) => {
    const low = Math.max(floor, Math.min(nextMin, nextMax));
    const high = Math.min(ceiling, Math.max(nextMin, nextMax));
    onChange(low <= floor ? null : low, high >= ceiling ? null : high);
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="flex-1">
          <span className="sr-only">Minimum price</span>
          <input
            suppressHydrationWarning
            type="number"
            inputMode="numeric"
            min={floor}
            max={ceiling}
            value={localMin}
            onChange={(event) => setLocalMin(Number(event.target.value))}
            onBlur={() => commit(localMin, localMax)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit(localMin, localMax);
            }}
            className="w-full"
            aria-label={`Minimum price in ${currencySymbol}`}
          />
        </label>
        <span aria-hidden="true" style={{ color: 'var(--cw-ink-subtle)' }}>
          –
        </span>
        <label className="flex-1">
          <span className="sr-only">Maximum price</span>
          <input
            suppressHydrationWarning
            type="number"
            inputMode="numeric"
            min={floor}
            max={ceiling}
            value={localMax}
            onChange={(event) => setLocalMax(Number(event.target.value))}
            onBlur={() => commit(localMin, localMax)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit(localMin, localMax);
            }}
            className="w-full"
            aria-label={`Maximum price in ${currencySymbol}`}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <input
          suppressHydrationWarning
          type="range"
          min={floor}
          max={ceiling}
          step={10}
          value={localMin}
          onChange={(event) => {
            const value = Math.min(Number(event.target.value), localMax);
            setLocalMin(value);
          }}
          onMouseUp={() => commit(localMin, localMax)}
          onTouchEnd={() => commit(localMin, localMax)}
          onKeyUp={() => commit(localMin, localMax)}
          aria-label="Minimum price slider"
          className="w-full"
          style={{ accentColor: 'var(--cw-primary)', padding: 0, border: 'none' }}
        />
        <input
          suppressHydrationWarning
          type="range"
          min={floor}
          max={ceiling}
          step={10}
          value={localMax}
          onChange={(event) => {
            const value = Math.max(Number(event.target.value), localMin);
            setLocalMax(value);
          }}
          onMouseUp={() => commit(localMin, localMax)}
          onTouchEnd={() => commit(localMin, localMax)}
          onKeyUp={() => commit(localMin, localMax)}
          aria-label="Maximum price slider"
          className="w-full"
          style={{ accentColor: 'var(--cw-primary)', padding: 0, border: 'none' }}
        />
      </div>

      <p
        className="mt-2"
        style={{
          margin: '8px 0 0',
          color: 'var(--cw-ink-subtle)',
          fontFamily: 'var(--cw-font-body)',
          fontSize: 'var(--cw-fs-micro)',
        }}
      >
        {currencySymbol}
        {localMin} – {currencySymbol}
        {localMax} per unit
      </p>
    </div>
  );
};
