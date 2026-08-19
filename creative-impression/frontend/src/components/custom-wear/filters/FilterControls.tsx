'use client';

import React, { useState } from 'react';
import type { FilterOption } from '@/types/custom-wear';

export interface FilterControlProps {
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  /** Show the first N options, with a "Show all" toggle for the rest. */
  collapseAfter?: number;
  groupLabel: string;
}

const useCollapsible = (options: FilterOption[], collapseAfter?: number) => {
  const [expanded, setExpanded] = useState(false);
  const isCollapsible = Boolean(collapseAfter && options.length > collapseAfter);
  const visible = isCollapsible && !expanded ? options.slice(0, collapseAfter) : options;
  return {
    visible,
    isCollapsible,
    expanded,
    setExpanded,
    hiddenCount: options.length - (collapseAfter ?? 0),
  };
};

const ShowAllButton: React.FC<{ expanded: boolean; hiddenCount: number; onClick: () => void }> = ({
  expanded,
  hiddenCount,
  onClick,
}) => (
  <button
    suppressHydrationWarning
    type="button"
    onClick={onClick}
    className="mt-2 underline transition-opacity hover:opacity-70"
    style={{
      fontFamily: 'var(--cw-font-body)',
      fontSize: 'var(--cw-fs-micro)',
      fontWeight: 600,
      color: 'var(--cw-ink-muted)',
    }}
  >
    {expanded ? 'Show less' : `Show all (+${hiddenCount})`}
  </button>
);

/** Circular colour swatches. Selection is shown by ring AND check mark. */
export const SwatchFilter: React.FC<FilterControlProps> = ({
  options,
  selected,
  onToggle,
  collapseAfter,
  groupLabel,
}) => {
  const { visible, isCollapsible, expanded, setExpanded, hiddenCount } = useCollapsible(
    options,
    collapseAfter
  );

  return (
    <div>
      <div role="group" aria-label={groupLabel} className="flex flex-wrap gap-2.5">
        {visible.map((option) => {
          const isSelected = selected.includes(option.id);
          const isLight = option.hex ? isLightColor(option.hex) : false;
          return (
            <button
              suppressHydrationWarning
              key={option.id}
              type="button"
              onClick={() => onToggle(option.id)}
              aria-pressed={isSelected}
              aria-label={option.label}
              title={option.label}
              className="relative flex h-7 w-7 items-center justify-center rounded-full transition-transform hover:scale-110"
              style={{
                background: option.secondaryHex
                  ? `linear-gradient(135deg, ${option.hex} 50%, ${option.secondaryHex} 50%)`
                  : option.hex,
                boxShadow: isSelected
                  ? '0 0 0 2px var(--cw-white), 0 0 0 4px var(--cw-primary)'
                  : 'inset 0 0 0 1px rgba(0,0,0,0.18)',
              }}
            >
              {isSelected && (
                <svg
                  aria-hidden="true"
                  className="h-3.5 w-3.5"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke={isLight ? '#111111' : '#FFFFFF'}
                  strokeWidth={3}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4 10.5 4 4 8-9" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
      {isCollapsible && (
        <ShowAllButton
          expanded={expanded}
          hiddenCount={hiddenCount}
          onClick={() => setExpanded((value) => !value)}
        />
      )}
    </div>
  );
};

/** Pill buttons — used for sizes. Selected chips use the accent colour. */
export const ChipFilter: React.FC<FilterControlProps> = ({
  options,
  selected,
  onToggle,
  collapseAfter,
  groupLabel,
}) => {
  const { visible, isCollapsible, expanded, setExpanded, hiddenCount } = useCollapsible(
    options,
    collapseAfter
  );

  const adult = visible.filter((option) => option.group !== 'kids');
  const kids = visible.filter((option) => option.group === 'kids');

  const renderChips = (list: FilterOption[]) => (
    <div className="flex flex-wrap gap-1.5">
      {list.map((option) => {
        const isSelected = selected.includes(option.id);
        return (
          <button
            suppressHydrationWarning
            key={option.id}
            type="button"
            onClick={() => onToggle(option.id)}
            aria-pressed={isSelected}
            className="min-w-[42px] transition-colors"
            style={{
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-micro)',
              fontWeight: 600,
              padding: '7px 10px',
              borderRadius: 'var(--cw-radius-chip)',
              border: `1px solid ${isSelected ? 'var(--cw-primary)' : 'var(--cw-border)'}`,
              backgroundColor: isSelected ? 'var(--cw-primary)' : 'var(--cw-white)',
              color: isSelected ? 'var(--cw-on-primary)' : 'var(--cw-ink-muted)',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div role="group" aria-label={groupLabel}>
      {adult.length > 0 && renderChips(adult)}
      {kids.length > 0 && (
        <>
          <p
            className="mb-1.5 mt-3 uppercase"
            style={{
              color: 'var(--cw-ink-subtle)',
              fontFamily: 'var(--cw-font-body)',
              fontSize: '10.5px',
              fontWeight: 700,
              letterSpacing: '0.1em',
            }}
          >
            Kids sizes
          </p>
          {renderChips(kids)}
        </>
      )}
      {isCollapsible && (
        <ShowAllButton
          expanded={expanded}
          hiddenCount={hiddenCount}
          onClick={() => setExpanded((value) => !value)}
        />
      )}
    </div>
  );
};

/** Checkbox list — the default control for every other filter group. */
export const CheckboxFilter: React.FC<FilterControlProps> = ({
  options,
  selected,
  onToggle,
  collapseAfter,
  groupLabel,
}) => {
  const { visible, isCollapsible, expanded, setExpanded, hiddenCount } = useCollapsible(
    options,
    collapseAfter
  );

  return (
    <div role="group" aria-label={groupLabel}>
      <ul className="flex flex-col gap-2">
        {visible.map((option) => {
          const isSelected = selected.includes(option.id);
          return (
            <li key={option.id}>
              <label
                className="flex cursor-pointer items-center gap-2.5"
                style={{
                  fontFamily: 'var(--cw-font-body)',
                  fontSize: 'var(--cw-fs-small)',
                  color: isSelected ? 'var(--cw-ink)' : 'var(--cw-ink-muted)',
                  fontWeight: isSelected ? 600 : 400,
                }}
              >
                <input
                  suppressHydrationWarning
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(option.id)}
                  className="h-[16px] w-[16px] flex-shrink-0 cursor-pointer rounded-[3px]"
                  style={{
                    accentColor: 'var(--cw-primary)',
                    borderColor: 'var(--cw-border)',
                    padding: 0,
                  }}
                />
                <span>{option.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {isCollapsible && (
        <ShowAllButton
          expanded={expanded}
          hiddenCount={hiddenCount}
          onClick={() => setExpanded((value) => !value)}
        />
      )}
    </div>
  );
};

/** Relative luminance check, so the tick stays legible on pale swatches. */
function isLightColor(hex: string): boolean {
  const value = hex.replace('#', '');
  if (value.length !== 6) return false;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 165;
}
