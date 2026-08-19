'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { customWearContent } from '@/config/custom-wear/content';
import { FilterSidebar, type FilterSidebarProps } from './FilterSidebar';

export interface MobileFilterDrawerProps extends FilterSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  resultCount: number;
}

/**
 * Slide-in filter drawer for small screens.
 *
 * Handles the three things a drawer must get right: Escape closes it, focus is
 * trapped inside while open and returned to the trigger on close, and the page
 * behind it cannot scroll.
 */
export const MobileFilterDrawer: React.FC<MobileFilterDrawerProps> = ({
  isOpen,
  onClose,
  resultCount,
  ...sidebarProps
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return undefined;

    previousFocusRef.current = document.activeElement as HTMLElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    // Move focus into the panel once it is mounted.
    const timer = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('button, a[href], input, select, textarea')
        ?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(timer);
      previousFocusRef.current?.focus();
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1050] lg:hidden">
      <button
        suppressHydrationWarning
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/50"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={customWearContent.labels.filters}
        className="absolute inset-y-0 left-0 flex w-[88%] max-w-[380px] flex-col bg-white shadow-2xl"
        style={{ animation: 'cwDrawerIn 220ms cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        <style>{`@keyframes cwDrawerIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }`}</style>

        <div
          className="flex items-center justify-between px-4 py-3.5"
          style={{ borderBottom: '1px solid var(--cw-border)' }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--cw-font-body)',
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--cw-ink)',
            }}
          >
            {customWearContent.labels.filters}
          </h2>
          <button
            suppressHydrationWarning
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-neutral-100"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              style={{ color: 'var(--cw-ink)' }}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          <FilterSidebar {...sidebarProps} compact />
        </div>

        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderTop: '1px solid var(--cw-border)' }}
        >
          <button
            suppressHydrationWarning
            type="button"
            onClick={sidebarProps.onClearAll}
            className="cw-cta cw-cta--outline flex-1"
          >
            {customWearContent.labels.clearAll}
          </button>
          <button
            suppressHydrationWarning
            type="button"
            onClick={onClose}
            className="cw-cta cw-cta--accent flex-1"
          >
            Show {resultCount} {resultCount === 1 ? 'result' : 'results'}
          </button>
        </div>
      </div>
    </div>
  );
};
