'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store';
import { apiClient } from '@/lib/api-client';
import { logout } from '@/store/slices/auth';
import { clearCart } from '@/store/slices/cart';
import { SearchAutocomplete } from '@/components/search';
import { AuthToggleButtons } from './AuthToggleButtons';
import { AnnouncementBar } from './AnnouncementBar';
import { APPAREL_DEPARTMENTS, storeHref, type StoreCategory } from '@/lib/category-tree';
import { DesktopNavPanel, MobileNavItem, isMega } from './NavMenus';

/** Edit these values to change nav menu link styling (Home, Products, etc.). */
export const NAV_MENU_STYLES = {
  color: '#000000',
  fontSize: '13px',
  mobileFontSize: '14px',
  fontFamily: 'var(--font-montserrat)',
  fontWeight: 500,
};

export type SubCategory = {
  name: string;
  href: string;
  /** Third level: shown as links under this entry's column heading. */
  children?: SubCategory[];
};

export type NavCategory = {
  name: string;
  href: string;
  subcategories?: SubCategory[];
  /** False for groupings with no page of their own ("More"). */
  showAll?: boolean;
};

export const HEADER_NAVIGATION: NavCategory[] = [
  { name: 'Home', href: '/' },
  { name: 'New Arrivals', href: '/products/new-arrivals' },
  {
    name: 'Womens',
    href: '/products/womens',
    subcategories: [
      { name: 'Polo T-Shirt', href: '/products/womens/polo-t-shirt' },
      { name: 'Top & Tunic', href: '/products/womens/tops-tunics' },
      { name: 'Round Neck T-Shirt', href: '/products/womens/round-neck-tshirts' },
      { name: 'Plus Size', href: '/products/womens/plus-size' },
    ],
  },
  {
    name: 'Mens',
    href: '/products/mens',
    subcategories: [
      { name: 'Polo T-Shirt', href: '/products/mens/polo-t-shirt' },
      { name: 'Round Neck T-Shirt', href: '/products/mens/round-neck-tshirts' },
      { name: 'Shirts', href: '/products/mens/shirts' },
    ],
  },
  {
    name: 'Kids',
    href: '/products/kids',
    subcategories: [
      { name: 'Boys Polo T-Shirt', href: '/products/kids/boys-polo-tshirt' },
      { name: 'Boys Round Neck T-Shirt', href: '/products/kids/boys-round-neck-tshirt' },
      { name: 'Girl Polo T-Shirt', href: '/products/kids/girl-polo-tshirt' },
      { name: 'Girl Round Neck T-Shirt', href: '/products/kids/girl-round-neck-tshirt' },
      { name: 'Girl Tops', href: '/products/kids/girl-tops' },
    ],
  },
  { name: 'Sale', href: '/products/sale' },
  {
    name: 'Custom Wear',
    href: '/custom-wear',
    subcategories: [
      { name: "Men's Custom Wear", href: '/custom-wear/men' },
      { name: "Women's Custom Wear", href: '/custom-wear/women' },
      { name: "Kid's Custom Wear", href: '/custom-wear/kids' },
      { name: 'Get a Bulk Quote', href: '/custom-wear?mode=quote' },
    ],
  },
];

/**
 * The header labels the apparel departments have always had. Used only while
 * the department keeps the name it was seeded with, so a rename in the admin
 * shows up in the menu.
 */
const DEPARTMENT_LABELS: Record<string, { name: string; label: string }> = {
  womens: { name: 'Women', label: 'Womens' },
  mens: { name: 'Men', label: 'Mens' },
  kids: { name: 'Kids', label: 'Kids' },
};

/** More than this many extra departments fold into one "More" menu, so the bar fits. */
const MAX_INLINE_DEPARTMENTS = 2;

/** A category and two levels under it: department → column headings → links. */
const toNavCategory = (category: StoreCategory): NavCategory => {
  const legacy = DEPARTMENT_LABELS[category.slug];
  return {
    name: legacy && legacy.name === category.name ? legacy.label : category.name,
    href: storeHref(category),
    subcategories: category.children.length
      ? category.children.map((child) => ({
          name: child.name,
          href: storeHref(child),
          children: child.children.length
            ? child.children.map((grand) => ({ name: grand.name, href: storeHref(grand) }))
            : undefined,
        }))
      : undefined,
  };
};

/**
 * The header menu, from the category tree.
 *
 * Home and New Arrivals, then Women, Men and Kids, then every other active
 * department (Footwear, Electronics…), then Sale and Custom Wear. Each
 * department's dropdown is its subcategories, with their own subcategories
 * listed beneath them, so a category the admin creates appears without a
 * code change. More than `maxInline` other departments fold into "More".
 * With no tree (the API was down) the static menu is used as it is.
 */
export function buildNavigation(
  categories: StoreCategory[] | null | undefined,
  maxInline: number = MAX_INLINE_DEPARTMENTS
): NavCategory[] {
  if (!categories) return HEADER_NAVIGATION;
  const apparelSlugs = APPAREL_DEPARTMENTS as readonly string[];
  const apparel = APPAREL_DEPARTMENTS.map((slug) => categories.find((c) => c.slug === slug))
    .filter((c): c is StoreCategory => Boolean(c))
    .map(toNavCategory);
  const departments = categories.filter((c) => !apparelSlugs.includes(c.slug)).map(toNavCategory);
  const extra: NavCategory[] =
    departments.length > maxInline
      ? [
          {
            name: 'More',
            href: departments[0].href,
            showAll: false,
            subcategories: departments.map((d) => ({
              name: d.name,
              href: d.href,
              children: d.subcategories?.map(({ name, href }) => ({ name, href })),
            })),
          },
        ]
      : departments;

  // The static entries that are not departments: Home, New Arrivals, Sale, Custom Wear.
  const fixed = HEADER_NAVIGATION.filter((item) => {
    const slug = item.href.match(/^\/products\/([^/]+)$/)?.[1];
    return !slug || !apparelSlugs.includes(slug);
  });
  const at = fixed.findIndex((item) => item.href === '/products/sale');
  const middle = [...apparel, ...extra];
  return at === -1 ? [...fixed, ...middle] : [...fixed.slice(0, at), ...middle, ...fixed.slice(at)];
}

export interface HeaderProps {
  /**
   * The announcement bar's editable content, from the `brand` namespace.
   * Omitted entirely (server layout aside) the bar falls back to the defaults
   * compiled into `AnnouncementBar`.
   */
  announcement?: {
    enabled: boolean;
    message: string;
    scroll: boolean;
    speedSeconds: number;
  };
  /** Active category tree from the server layout; null falls back to the static menu. */
  categories?: StoreCategory[] | null;
}

export const Header: React.FC<HeaderProps> = ({ announcement, categories }) => {
  const navigation = React.useMemo(() => buildNavigation(categories), [categories]);
  /** Departments listed one by one in the drawer, where width is no constraint. */
  const mobileNavigation = React.useMemo<NavCategory[]>(
    () => buildNavigation(categories, Infinity),
    [categories]
  );
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [expandedMobileSubmenu, setExpandedMobileSubmenu] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hoverTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const DROPDOWN_CLOSE_DELAY = 200;

  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { items: cartItems } = useSelector((state: RootState) => state.cart);

  // Custom-wear pieces wait in the cart for a quote; each counts once rather
  // than by units, which run to the hundreds on a team order.
  const quoteLineCount = useSelector((state: RootState) => state.customWear.quoteLines.length);
  const cartItemCount =
    cartItems.reduce((sum, item) => sum + item.quantity, 0) + quoteLineCount;

  /** Collapse the bar once a search has gone somewhere, or on a second Escape. */
  const closeSearch = () => {
    setIsSearchOpen(false);
    setIsMobileMenuOpen(false);
  };

  const openDropdown = (name: string) => {
    Object.keys(hoverTimeoutRef.current).forEach((key) => {
      if (hoverTimeoutRef.current[key]) {
        clearTimeout(hoverTimeoutRef.current[key]);
        delete hoverTimeoutRef.current[key];
      }
    });
    setActiveDropdown(name);
    setIsAnimating(true);
  };

  const closeDropdown = (name: string, delay: number = 100) => {
    hoverTimeoutRef.current[name] = setTimeout(() => {
      setIsAnimating(false);
      setTimeout(() => {
        setActiveDropdown((prev) => (prev === name ? null : prev));
        delete hoverTimeoutRef.current[name];
      }, DROPDOWN_CLOSE_DELAY);
    }, delay);
  };

  const handleMouseEnter = (name: string) => {
    openDropdown(name);
  };

  const handleMouseLeave = (name: string) => {
    closeDropdown(name);
  };

  const handleDropdownClick = (name: string) => {
    if (activeDropdown === name) {
      if (hoverTimeoutRef.current[name]) {
        clearTimeout(hoverTimeoutRef.current[name]);
        delete hoverTimeoutRef.current[name];
      }
      setIsAnimating(false);
      setTimeout(() => {
        setActiveDropdown(null);
      }, DROPDOWN_CLOSE_DELAY);
    } else {
      openDropdown(name);
    }
  };

  const toggleMobileSubmenu = (name: string) => {
    setExpandedMobileSubmenu((prev) => (prev === name ? null : name));
  };

  const handleMobileSubmenuClick = (name: string) => {
    toggleMobileSubmenu(name);
  };

  useEffect(() => {
    const handleClickOutside = () => {
      if (activeDropdown && !hoverTimeoutRef.current[activeDropdown]) {
        closeDropdown(activeDropdown, 0);
      }
    };
    document.addEventListener('click', handleClickOutside);

    // Captured now rather than read in the cleanup: by the time cleanup runs
    // the ref may point at a different object, and the timers this effect
    // started would be left running.
    const timeouts = hoverTimeoutRef.current;
    return () => {
      document.removeEventListener('click', handleClickOutside);
      Object.values(timeouts).forEach((timeout) => clearTimeout(timeout));
    };
  }, [activeDropdown]);

  // Close the account menu when clicking outside it.
  useEffect(() => {
    if (!isAccountMenuOpen) return;
    const handleAccountClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleAccountClickOutside);
    return () => document.removeEventListener('mousedown', handleAccountClickOutside);
  }, [isAccountMenuOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMobileMenuOpen]);

  const handleLogout = () => {
    setIsAccountMenuOpen(false);
    // Best-effort server-side logout; local state is cleared regardless.
    apiClient.post('/auth/logout').catch(() => {});
    localStorage.removeItem('token');
    dispatch(logout());
    dispatch(clearCart());
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-white border-b border-line/60 shadow-[0_1px_0_rgba(17,17,17,0.06)]">
      {announcement?.enabled !== false && (
        <AnnouncementBar
          message={announcement?.message}
          scroll={announcement?.scroll}
          speed={announcement?.speedSeconds}
        />
      )}

      {/* Main header */}
      <div className="w-full">
        <div className="container-fluid">
          <div className="flex h-12 items-center gap-3 md:h-[56px] md:gap-6">
            {/* Left: mobile menu trigger */}
            <div className="flex flex-1 items-center lg:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center text-ink-2 hover:bg-surface-2 rounded-lg transition-colors lg:hidden"
                aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
                suppressHydrationWarning={true}
              >
                <svg
                  className="h-5 w-5 md:h-6 md:w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  {isMobileMenuOpen ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  )}
                </svg>
              </button>
            </div>

            {/* Center: logo */}
            <div className="flex min-w-0 flex-shrink-0 justify-center lg:flex-1 lg:justify-start">
              <Link href="/" className="group/logo flex min-w-0 items-center gap-2 md:gap-2.5">
                <Image
                  src="/images/IX%20Logo.JPG"
                  alt="Creative Impression Logo"
                  width={32}
                  height={32}
                  className="h-[22px] w-[22px] flex-shrink-0 object-contain md:h-[26px] md:w-[26px]"
                  priority
                />
                <span className="truncate text-[12px] font-semibold leading-none tracking-tight text-ink sm:text-[13px] md:text-[15px] xl:text-base">
                  Creative Impression
                </span>
              </Link>
            </div>

            {/* Desktop nav */}
            <nav className="hidden flex-shrink-0 items-center justify-center gap-x-6 lg:flex xl:gap-x-8">
              {navigation.map((item) => {
                const hasDropdown = item.subcategories && item.subcategories.length > 0;
                const isDropdownOpen = activeDropdown === item.name;
                const navItemStyle: React.CSSProperties = {
                  color: NAV_MENU_STYLES.color,
                  fontSize: NAV_MENU_STYLES.fontSize,
                  fontFamily: NAV_MENU_STYLES.fontFamily,
                  fontWeight: NAV_MENU_STYLES.fontWeight,
                  cursor: 'pointer',
                  position: 'relative',
                };

                if (!hasDropdown) {
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className="relative inline-flex items-center whitespace-nowrap uppercase tracking-[0.08em] py-3 transition-colors hover:text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:origin-left after:scale-x-0 after:bg-[var(--brand)] after:transition-transform after:duration-200 hover:after:scale-x-100"
                      style={navItemStyle}
                    >
                      {item.name}
                    </Link>
                  );
                }

                return (
                  <div
                    key={item.name}
                    className="relative"
                    ref={(el) => {
                      dropdownRefs.current[item.name] = el;
                    }}
                    onMouseEnter={() => handleMouseEnter(item.name)}
                    onMouseLeave={() => handleMouseLeave(item.name)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Escape' || !isDropdownOpen) return;
                      closeDropdown(item.name, 0);
                      event.currentTarget.querySelector('button')?.focus();
                    }}
                    onBlur={(event) => {
                      // Tabbing past the last link closes the menu.
                      if (isDropdownOpen && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        closeDropdown(item.name, 0);
                      }
                    }}
                  >
                    <button
                      suppressHydrationWarning
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleDropdownClick(item.name);
                      }}
                      className="relative inline-flex items-center whitespace-nowrap uppercase tracking-[0.08em] py-3 transition-colors hover:text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:origin-left after:scale-x-0 after:bg-[var(--brand)] after:transition-transform after:duration-200 hover:after:scale-x-100"
                      style={navItemStyle}
                      aria-expanded={isDropdownOpen}
                      aria-haspopup="true"
                    >
                      {item.name}
                    </button>

                    {isDropdownOpen && (
                      <div
                        className={`absolute top-full pt-3 transition-all duration-200 ease-out ${
                          isMega(item) ? 'left-1/2 -translate-x-1/2' : 'left-0'
                        } ${
                          isAnimating
                            ? 'opacity-100 translate-y-0 pointer-events-auto'
                            : 'opacity-0 -translate-y-2 pointer-events-none'
                        }`}
                        onMouseEnter={() => openDropdown(item.name)}
                        onMouseLeave={() => closeDropdown(item.name)}
                        style={{ zIndex: 50 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DesktopNavPanel item={item} onNavigate={() => closeDropdown(item.name, 0)} />
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* Right: actions */}
            <div className="flex flex-1 items-center justify-end gap-1 md:gap-1.5">
              <button
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className="flex h-9 w-9 items-center justify-center text-ink-2 transition-colors hover:bg-surface-2 rounded-lg"
                aria-label="Toggle search"
                aria-expanded={isSearchOpen}
                suppressHydrationWarning={true}
              >
                <svg
                  className="h-5 w-5 md:h-6 md:w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </button>

              <Link
                href="/cart"
                className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center text-ink-2 hover:bg-surface-2 transition-colors rounded-lg"
                aria-label="Cart"
              >
                <svg
                  className="h-5 w-5 md:h-6 md:w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2.5 3h1.6a1 1 0 0 1 .98.8L5.4 6m0 0 1.5 7.2a1.5 1.5 0 0 0 1.47 1.2h7.9a1.5 1.5 0 0 0 1.47-1.18L19.2 6H5.4Z" />
                  <circle cx="9" cy="19" r="1.4" />
                  <circle cx="17" cy="19" r="1.4" />
                </svg>
                {cartItemCount > 0 && (
                  <span
                    className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-0.5 text-[10px] text-ink"
                    style={{ background: 'var(--brand)', lineHeight: 1 }}
                  >
                    {cartItemCount > 9 ? '9+' : cartItemCount}
                  </span>
                )}
              </Link>

              {user ? (
                <div className="relative flex-shrink-0" ref={accountMenuRef}>
                  <button
                    onClick={() => setIsAccountMenuOpen((open) => !open)}
                    className="flex items-center gap-1 p-1 md:p-2 text-neutral-700 hover:text-primary-700 transition-colors"
                    aria-haspopup="menu"
                    aria-expanded={isAccountMenuOpen}
                    suppressHydrationWarning={true}
                  >
                    <svg className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="hidden md:inline max-w-[8rem] truncate text-sm font-medium">
                      {user.firstName || user.email}
                    </span>
                    <svg
                      className={`hidden md:block h-4 w-4 transition-transform duration-200 ${isAccountMenuOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isAccountMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-50 mt-2 overflow-hidden"
                      style={{
                        background: '#ffffff',
                        border: '1px solid rgba(17,17,17,0.08)',
                        borderRadius: '12px',
                        boxShadow: '0 8px 32px rgba(17,17,17,0.12), 0 2px 8px rgba(17,17,17,0.06)',
                        minWidth: '200px',
                        animation: 'submenu-open 0.15s ease-out both',
                      }}
                    >
                      <div className="border-b border-neutral-100 px-4 py-3">
                        <p className="truncate text-sm text-neutral-900" style={{ fontWeight: 600 }}>
                          {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}
                        </p>
                        <p className="truncate text-xs text-neutral-500 mt-0.5">{user.email}</p>
                      </div>
                      <div className="py-1.5">
                        <Link
                          href="/dashboard"
                          className="nav-dropdown-item"
                          onClick={() => setIsAccountMenuOpen(false)}
                        >
                          My Account
                        </Link>
                        {user.role === 'ADMIN' && (
                          <Link
                            href="/admin"
                            className="nav-dropdown-item"
                            onClick={() => setIsAccountMenuOpen(false)}
                          >
                            Admin
                          </Link>
                        )}
                        <button
                          onClick={handleLogout}
                          className="nav-dropdown-item w-full text-left"
                          style={{ color: 'var(--sale)' }}
                        >
                          Logout
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="hidden flex-shrink-0 items-center sm:flex sm:gap-2 sm:pl-1.5 md:pl-2.5">
                  <span aria-hidden="true" className="mr-1 h-5 w-px bg-line md:mr-1.5" />
                  <AuthToggleButtons />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Expanding search bar. Mounted only while open so the combobox takes
            the caret on every opening, and drops its in-flight request and its
            listbox on every closing. */}
        {isSearchOpen && (
          <div
            className="w-full border-t border-line/50 py-2.5 sm:py-3"
            style={{ animation: 'submenu-open 0.15s ease-out both' }}
          >
            <div className="container-fluid">
              {/* Capped and centred: the header container runs the full width
                  of a desktop, and a suggestion row stretched across 1400px
                  puts the price a hand's width from the product name. */}
              <SearchAutocomplete autoFocus onDismiss={closeSearch} className="mx-auto max-w-3xl" />
            </div>
          </div>
        )}

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div
            className="mobile-drawer-overlay fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px] lg:hidden"
            role="presentation"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <nav
              className="mobile-drawer"
              aria-label="Mobile navigation"
              aria-modal="true"
              role="dialog"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mobile-drawer-header">
                <button
                  type="button"
                  className="mobile-drawer-close"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Close menu"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                    <path d="m6 6 12 12M18 6 6 18" />
                  </svg>
                </button>
                <Link href="/" className="mobile-drawer-brand" onClick={() => setIsMobileMenuOpen(false)}>
                  <Image src="/images/IX%20Logo.JPG" alt="Creative Impression" width={28} height={28} />
                  <span>Creative Impression</span>
                </Link>
              </div>
              <div className="mobile-drawer-links">
                {mobileNavigation.map((item) => {
                  const hasSubcategories = item.subcategories && item.subcategories.length > 0;
                  const isExpanded = expandedMobileSubmenu === item.name;
                  const mobileItemStyle: React.CSSProperties = {
                    color: NAV_MENU_STYLES.color,
                    fontSize: NAV_MENU_STYLES.mobileFontSize,
                    fontFamily: NAV_MENU_STYLES.fontFamily,
                    fontWeight: NAV_MENU_STYLES.fontWeight,
                  };

                  if (!hasSubcategories) {
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className="mobile-drawer-link"
                        style={mobileItemStyle}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {item.name}
                      </Link>
                    );
                  }

                  return (
                    <MobileNavItem
                      key={item.name}
                      item={item}
                      style={mobileItemStyle}
                      expanded={isExpanded}
                      onToggle={() => handleMobileSubmenuClick(item.name)}
                      onNavigate={() => {
                        setExpandedMobileSubmenu(null);
                        setIsMobileMenuOpen(false);
                      }}
                    />
                  );
                })}
              </div>

              {/* Mobile Auth Buttons */}
              {!user ? (
                <div className="mobile-drawer-account">
                  <div>
                    <AuthToggleButtons />
                  </div>
                </div>
              ) : (
                <div className="mobile-drawer-account space-y-1">
                  <Link
                    href="/dashboard"
                    className="mobile-drawer-link"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    My Account
                  </Link>
                  {user.role === 'ADMIN' && (
                    <Link
                      href="/admin"
                      className="mobile-drawer-link"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      Admin
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      handleLogout();
                    }}
                    className="mobile-drawer-link w-full text-left text-[var(--sale)]"
                  >
                    Logout
                  </button>
                </div>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};
