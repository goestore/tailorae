'use client';

import React, { useId, useState } from 'react';

export interface FilterSectionProps {
  title: string;
  defaultOpen?: boolean;
  /** Number shown next to the title when the group has active selections. */
  activeCount?: number;
  children: React.ReactNode;
}

/**
 * Collapsible sidebar group. Uses a real button with `aria-expanded` and
 * `aria-controls` so keyboard and screen-reader users get the same affordance
 * as the pointer.
 */
export const FilterSection: React.FC<FilterSectionProps> = ({
  title,
  defaultOpen = true,
  activeCount = 0,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className="py-4" style={{ borderTop: '1px solid var(--cw-border)' }}>
      <h3 style={{ margin: 0 }}>
        <button
          suppressHydrationWarning
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-2 text-left"
          style={{
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-small)',
            fontWeight: 700,
            color: 'var(--cw-ink)',
            letterSpacing: '0.02em',
          }}
        >
          <span className="flex items-center gap-2">
            {title}
            {activeCount > 0 && (
              <span
                style={{
                  backgroundColor: 'var(--cw-primary)',
                  color: 'var(--cw-on-primary)',
                  fontSize: '10px',
                  fontWeight: 700,
                  borderRadius: '999px',
                  padding: '1px 7px',
                }}
              >
                {activeCount}
              </span>
            )}
          </span>
          <svg
            aria-hidden="true"
            className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            style={{ color: 'var(--cw-ink-subtle)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
          </svg>
        </button>
      </h3>

      <div id={panelId} hidden={!isOpen} className="pt-3.5">
        {children}
      </div>
    </section>
  );
};
