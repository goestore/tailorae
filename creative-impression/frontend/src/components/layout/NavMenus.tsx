'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { NavCategory, SubCategory } from './Header';

/**
 * The header's dropdown contents.
 *
 * Desktop: a department whose subcategories have subcategories of their own
 * opens a mega menu — one column per subcategory, its heading a link, its
 * children listed beneath (Kids → Boys: Polo, Round Neck · Girls: …). Flat
 * departments keep the single-column list.
 *
 * Mobile: the same tree as nested, expandable levels.
 */

const linkFont: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontWeight: 500,
};

/** True when the dropdown needs columns rather than a single list. */
export const isMega = (item: NavCategory): boolean =>
  (item.subcategories ?? []).some((sub) => (sub.children?.length ?? 0) > 0);

export const DesktopNavPanel: React.FC<{ item: NavCategory; onNavigate: () => void }> = ({
  item,
  onNavigate,
}) => {
  const subs = item.subcategories ?? [];
  const showAll = item.showAll !== false;

  if (!isMega(item)) {
    return (
      <div className="nav-dropdown-panel">
        {showAll && (
          <Link href={item.href} className="nav-dropdown-item" style={linkFont} onClick={onNavigate}>
            All {item.name}
          </Link>
        )}
        {subs.map((sub) => (
          <Link key={sub.href} href={sub.href} className="nav-dropdown-item" style={linkFont} onClick={onNavigate}>
            {sub.name}
          </Link>
        ))}
      </div>
    );
  }

  const columns = Math.min(subs.length, 4);
  return (
    <div className="nav-dropdown-panel nav-mega-panel">
      <div className="nav-mega-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(150px, auto))` }}>
        {subs.map((sub) => (
          <div key={sub.href} className="nav-mega-column">
            <Link href={sub.href} className="nav-mega-heading" onClick={onNavigate}>
              {sub.name}
            </Link>
            {sub.children?.map((child) => (
              <Link key={child.href} href={child.href} className="nav-mega-link" style={linkFont} onClick={onNavigate}>
                {child.name}
              </Link>
            ))}
          </div>
        ))}
      </div>
      {showAll && (
        <Link href={item.href} className="nav-mega-all" onClick={onNavigate}>
          Shop all {item.name} <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
};

const Chevron: React.FC<{ open: boolean }> = ({ open }) => (
  <svg
    className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

/** One entry below the top level; expands in place when it has children. */
const MobileSubItem: React.FC<{ sub: SubCategory; depth: number; onNavigate: () => void }> = ({
  sub,
  depth,
  onNavigate,
}) => {
  const [open, setOpen] = useState(false);
  const indent = { paddingLeft: 28 + (depth - 1) * 16 };
  const style = { ...linkFont, fontSize: '13px', ...indent };

  if (!sub.children?.length) {
    return (
      <Link href={sub.href} className="mobile-drawer-sublink" style={style} onClick={onNavigate}>
        {sub.name}
      </Link>
    );
  }
  return (
    <div>
      <button
        type="button"
        className="mobile-drawer-sublink w-full justify-between text-left"
        style={style}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{sub.name}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="mobile-drawer-nested">
          <Link
            href={sub.href}
            className="mobile-drawer-sublink"
            style={{ ...style, paddingLeft: indent.paddingLeft + 16 }}
            onClick={onNavigate}
          >
            All {sub.name}
          </Link>
          {sub.children.map((child) => (
            <MobileSubItem key={child.href} sub={child} depth={depth + 1} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
};

/** A top-level drawer entry with a submenu. */
export const MobileNavItem: React.FC<{
  item: NavCategory;
  style: React.CSSProperties;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}> = ({ item, style, expanded, onToggle, onNavigate }) => (
  <div className="mobile-drawer-group">
    <button
      suppressHydrationWarning
      type="button"
      onClick={onToggle}
      className="mobile-drawer-link flex w-full items-center justify-between"
      style={style}
      aria-expanded={expanded}
    >
      <span>{item.name}</span>
      <Chevron open={expanded} />
    </button>

    {expanded && (
      <div className="mobile-drawer-submenu" onClick={(event) => event.stopPropagation()}>
        {item.showAll !== false && (
          <Link
            href={item.href}
            className="mobile-drawer-sublink"
            style={{ ...linkFont, fontSize: '13px' }}
            onClick={onNavigate}
          >
            All {item.name}
          </Link>
        )}
        {item.subcategories?.map((sub) => (
          <MobileSubItem key={sub.href} sub={sub} depth={1} onNavigate={onNavigate} />
        ))}
      </div>
    )}
  </div>
);
