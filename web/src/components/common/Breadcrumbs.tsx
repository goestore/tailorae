import React from 'react';
import Link from 'next/link';

export interface Crumb {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps {
  items: Crumb[];
  className?: string;
}

/**
 * The trail already hand-rolled on the product page, extracted so every page
 * that needs one renders the same thing. Server component — it has no state,
 * so there is no reason to ship it to the browser.
 */
export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items, className = '' }) => (
  <nav aria-label="Breadcrumb" className={className}>
    <ol
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]"
      style={{ color: 'var(--ink-3)' }}
    >
      {items.map((crumb, index) => {
        const isLast = index === items.length - 1;
        return (
          <React.Fragment key={`${crumb.label}-${index}`}>
            <li style={isLast ? { color: 'var(--ink-2)', fontWeight: 500 } : undefined}>
              {crumb.href && !isLast ? (
                <Link href={crumb.href} className="transition-colors hover:text-ink">
                  {crumb.label}
                </Link>
              ) : (
                crumb.label
              )}
            </li>
            {!isLast && (
              <li aria-hidden="true" style={{ color: 'var(--border-strong)' }}>
                /
              </li>
            )}
          </React.Fragment>
        );
      })}
    </ol>
  </nav>
);
