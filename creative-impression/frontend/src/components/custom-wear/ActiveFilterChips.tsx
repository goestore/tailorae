'use client';

import React from 'react';
import { customWearContent } from '@/config/custom-wear/content';
import type { ActiveFilterChip } from '@/types/custom-wear';

export interface ActiveFilterChipsProps {
  chips: ActiveFilterChip[];
  onRemove: (chip: ActiveFilterChip) => void;
  onClearAll: () => void;
}

/** Removable summary of every applied filter, plus Clear All. */
export const ActiveFilterChips: React.FC<ActiveFilterChipsProps> = ({
  chips,
  onRemove,
  onClearAll,
}) => {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active filters" role="group">
      {chips.map((chip) => (
        <button
          suppressHydrationWarning
          key={`${chip.key}-${chip.value}`}
          type="button"
          onClick={() => onRemove(chip)}
          className="inline-flex items-center gap-1.5 transition-colors"
          style={{
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-micro)',
            fontWeight: 600,
            color: 'var(--cw-ink)',
            backgroundColor: 'var(--cw-primary-soft)',
            border: '1px solid var(--cw-primary)',
            borderRadius: 'var(--cw-radius-chip)',
            padding: '5px 9px',
          }}
        >
          <span>{chip.label}</span>
          <svg
            aria-hidden="true"
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
          <span className="sr-only">Remove filter</span>
        </button>
      ))}

      <button
        suppressHydrationWarning
        type="button"
        onClick={onClearAll}
        className="underline transition-opacity hover:opacity-70"
        style={{
          fontFamily: 'var(--cw-font-body)',
          fontSize: 'var(--cw-fs-micro)',
          fontWeight: 700,
          color: 'var(--cw-ink-muted)',
          marginLeft: '4px',
        }}
      >
        {customWearContent.labels.clearAll}
      </button>
    </div>
  );
};
