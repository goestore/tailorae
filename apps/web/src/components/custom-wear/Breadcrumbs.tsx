import React from 'react';
import Link from 'next/link';

export interface Crumb {
  label: string;
  /** Omitted on the final crumb, which is the current page. */
  href?: string;
}

export interface BreadcrumbsProps {
  items: Crumb[];
  className?: string;
}

/** Semantic breadcrumb trail. JSON-LD is emitted separately by the page. */
export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items, className = '' }) => (
  <nav aria-label="Breadcrumb" className={className}>
    <ol
      className="flex flex-wrap items-center gap-x-2 gap-y-1"
      style={{
        fontFamily: 'var(--cw-font-body)',
        fontSize: 'var(--cw-fs-micro)',
        color: 'var(--cw-ink-subtle)',
      }}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <li key={`${item.label}-${index}`} className="flex items-center gap-2">
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="transition-colors hover:underline"
                style={{ color: 'var(--cw-ink-subtle)' }}
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current={isLast ? 'page' : undefined} style={{ color: 'var(--cw-ink)' }}>
                {item.label}
              </span>
            )}
            {!isLast && (
              <span aria-hidden="true" style={{ color: 'var(--cw-border)' }}>
                /
              </span>
            )}
          </li>
        );
      })}
    </ol>
  </nav>
);
