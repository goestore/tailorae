'use client';

import React, { useEffect, useId, useRef, useState } from 'react';

export interface FilterMenuOption {
  id: string;
  label: string;
  hex?: string;
  secondaryHex?: string;
}

export interface FilterMenuProps {
  label: string;
  options: FilterMenuOption[];
  selected: string[];
  onToggle: (value: string) => void;
  /** Renders colours as swatches rather than checkboxes. */
  variant?: 'list' | 'swatch';
}

/**
 * One filter, as a button that opens a panel of choices.
 *
 * The page used to carry every filter group expanded down a permanent sidebar,
 * which cost a quarter of the width on every screen to show options most
 * visitors never touch. Collapsing each group behind its own button gives the
 * grid the full page and puts the filters on one line.
 */
export const FilterMenu: React.FC<FilterMenuProps> = ({
  label,
  options,
  selected,
  onToggle,
  variant = 'list',
}) => {
  const [isOpen, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Close on outside click and on Escape — a panel that traps the page is worse
  // than the sidebar it replaced.
  useEffect(() => {
    if (!isOpen) return undefined;

    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const count = selected.length;

  return (
    <div className="cw-fm" ref={wrapRef}>
      <button
        suppressHydrationWarning
        type="button"
        onClick={() => setOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="cw-fm-btn"
        data-active={count > 0 ? 'true' : undefined}
      >
        {label}
        {count > 0 && <span className="cw-fm-count">{count}</span>}
      </button>

      {isOpen && (
        <div id={panelId} className="cw-fm-panel" role="group" aria-label={label}>
          {variant === 'swatch' ? (
            <div className="cw-fm-swatches">
              {options.map((option) => (
                <button
                  suppressHydrationWarning
                  key={option.id}
                  type="button"
                  onClick={() => onToggle(option.id)}
                  aria-pressed={selected.includes(option.id)}
                  aria-label={option.label}
                  title={option.label}
                  className="cw-fm-swatch"
                  data-active={selected.includes(option.id) ? 'true' : undefined}
                  style={{
                    background: option.secondaryHex
                      ? `linear-gradient(135deg, ${option.hex} 50%, ${option.secondaryHex} 50%)`
                      : option.hex,
                  }}
                />
              ))}
            </div>
          ) : (
            <ul className="cw-fm-list">
              {options.map((option) => (
                <li key={option.id}>
                  <label className="cw-fm-row">
                    <input
                      suppressHydrationWarning
                      type="checkbox"
                      checked={selected.includes(option.id)}
                      onChange={() => onToggle(option.id)}
                    />
                    <span>{option.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
