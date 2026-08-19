'use client';

import React from 'react';

export interface PaginationProps {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}

/** Builds `1 … 4 5 6 … 12` so the control stays a fixed width at any depth. */
function buildPageList(page: number, pageCount: number): Array<number | 'gap'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);

  const pages = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const sorted = [...pages]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);

  const result: Array<number | 'gap'> = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) result.push('gap');
    result.push(value);
  });
  return result;
}

export const Pagination: React.FC<PaginationProps> = ({ page, pageCount, onChange }) => {
  if (pageCount <= 1) return null;

  const pages = buildPageList(page, pageCount);

  const buttonStyle = (isActive: boolean): React.CSSProperties => ({
    fontFamily: 'var(--cw-font-body)',
    fontSize: 'var(--cw-fs-micro)',
    fontWeight: isActive ? 700 : 500,
    minWidth: '38px',
    height: '38px',
    padding: '0 10px',
    borderRadius: 'var(--cw-radius-control)',
    border: `1px solid ${isActive ? 'var(--cw-primary)' : 'var(--cw-border)'}`,
    backgroundColor: isActive ? 'var(--cw-primary)' : 'var(--cw-white)',
    color: isActive ? 'var(--cw-on-primary)' : 'var(--cw-ink-muted)',
  });

  return (
    <nav aria-label="Product pagination" className="flex justify-center">
      <ul className="flex flex-wrap items-center gap-1.5">
        <li>
          <button
            suppressHydrationWarning
            type="button"
            onClick={() => onChange(page - 1)}
            disabled={page <= 1}
            style={{ ...buttonStyle(false), opacity: page <= 1 ? 0.4 : 1 }}
            className="transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
        </li>

        {pages.map((entry, index) =>
          entry === 'gap' ? (
            <li key={`gap-${index}`} aria-hidden="true" style={{ color: 'var(--cw-ink-subtle)' }}>
              …
            </li>
          ) : (
            <li key={entry}>
              <button
                suppressHydrationWarning
                type="button"
                onClick={() => onChange(entry)}
                aria-current={entry === page ? 'page' : undefined}
                aria-label={`Page ${entry}`}
                style={buttonStyle(entry === page)}
                className="transition-colors hover:bg-neutral-50"
              >
                {entry}
              </button>
            </li>
          )
        )}

        <li>
          <button
            suppressHydrationWarning
            type="button"
            onClick={() => onChange(page + 1)}
            disabled={page >= pageCount}
            style={{ ...buttonStyle(false), opacity: page >= pageCount ? 0.4 : 1 }}
            className="transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </li>
      </ul>
    </nav>
  );
};
