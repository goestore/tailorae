'use client';

import React from 'react';
import { customWearContent } from '@/config/custom-wear/content';
import type { PurchaseMode } from '@/types/custom-wear';

export interface PurchaseModeToggleProps {
  mode: PurchaseMode;
  onChange: (mode: PurchaseMode) => void;
  /** `hero` sits on the dark banner, `inline` on a light surface. */
  variant?: 'hero' | 'inline';
  className?: string;
  size?: 'md' | 'sm';
}

/**
 * Shop Now / Get Quote selector.
 *
 * Rendered as a radiogroup: exactly one option is active, and it is announced
 * to screen readers rather than being communicated by colour alone (the active
 * button also carries a check mark and `aria-pressed`).
 *
 * All styling comes from `customWearTheme.modeButton` via the `.cw-mode-btn`
 * class in `CustomWearThemeProvider` — change colours, sizes or labels there.
 */
export const PurchaseModeToggle: React.FC<PurchaseModeToggleProps> = ({
  mode,
  onChange,
  variant = 'inline',
  className = '',
  size = 'md',
}) => {
  const { labels } = customWearContent;

  const options: Array<{ id: PurchaseMode; label: string }> = [
    { id: 'shop', label: labels.shopNow },
    { id: 'quote', label: labels.getQuote },
  ];

  return (
    <div
      role="group"
      aria-label={customWearContent.labels.modeGroupLabel}
      className={`flex w-full flex-wrap items-stretch gap-2 sm:gap-3 sm:w-auto ${className}`.trim()}
    >
      {options.map((option) => {
        const isActive = mode === option.id;
        return (
          <button
            suppressHydrationWarning
            key={option.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.id)}
            className={[
              'cw-mode-btn inline-flex flex-1 items-center justify-center gap-2 sm:flex-none',
              size === 'sm' ? 'py-2' : '',
              variant === 'hero' && !isActive ? 'shadow-[0_2px_18px_rgba(0,0,0,0.35)]' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {isActive && (
              <svg
                aria-hidden="true"
                className="h-4 w-4 flex-shrink-0"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m4 10.5 4 4 8-9" />
              </svg>
            )}
            <span>{option.label}</span>
            <span className="sr-only">{isActive ? '(selected)' : ''}</span>
          </button>
        );
      })}
    </div>
  );
};
