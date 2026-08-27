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
import { AuthToggleButtons } from './AuthToggleButtons';
import { AnnouncementBar } from './AnnouncementBar';

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
};

export type NavCategory = {
  name: string;
  href: string;
  subcategories?: SubCategory[];
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
}

export const Header: React.FC<HeaderProps> = ({ announcement }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [expandedMobileSubmenu, setExpandedMobileSubmenu] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const mobileSubmenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hoverTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const DROPDOWN_CLOSE_DELAY = 200;

  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { items: cartItems } = useSelector((state: RootState) => state.cart);

  const cartItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (query) {
      router.push(`/products?search=${encodeURIComponent(query)}`);
      setIsSearchOpen(false);
      setIsMobileMenuOpen(false);
    }
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
    return () => {
      document.removeEventListener('click', handleClickOutside);
      Object.values(hoverTimeoutRef.current).forEach((timeout) => clearTimeout(timeout));
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
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      {announcement?.enabled !== false && (
        <AnnouncementBar
          message={announcement?.message}
          scroll={announcement?.scroll}
          speed={announcement?.speedSeconds}
        />
      )}

      {/* Main header */}
      <div className="w-full border-b border-line">
        <div className="container-fluid">
          <div className="flex h-12 items-center gap-3 md:h-[56px] md:gap-6">
            {/* Left: mobile menu trigger. flex-1 on mobile so the logo centres
                between it and the action cluster. */}
            <div className="flex flex-1 items-center xl:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2 xl:hidden"
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

            {/* Center: logo. A normal flex item, not absolutely positioned — the
                old `absolute left-1/2` centred it on the viewport regardless of
                the nav clusters, so on a narrow phone it overlapped the search
                button and swallowed its taps. */}
            <div className="flex min-w-0 flex-shrink-0 justify-center xl:flex-1 xl:justify-start">
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

              <nav className="hidden flex-shrink-0 items-center justify-center gap-x-6 xl:flex 2xl:gap-x-8">
                {HEADER_NAVIGATION.map((item) => {
                  const hasDropdown = item.subcategories && item.subcategories.length > 0;
                  const isDropdownOpen = activeDropdown === item.name;
                  const navItemStyle: React.CSSProperties = {
                    color: NAV_MENU_STYLES.color,
                    fontSize: NAV_MENU_STYLES.fontSize,
                    fontFamily: NAV_MENU_STYLES.fontFamily,
                    fontWeight: NAV_MENU_STYLES.fontWeight,
                    cursor: hasDropdown ? 'pointer' : 'pointer',
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
                          className={`absolute top-full left-1/2 -translate-x-1/2 pt-2 transition-all duration-200 ease-out ${
                            isAnimating ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
                          }`}
                          onMouseEnter={() => openDropdown(item.name)}
                          onMouseLeave={() => closeDropdown(item.name)}
                          style={{ zIndex: 50 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="min-w-[220px] overflow-hidden rounded-card border border-line bg-white py-2 shadow-3">
                            {item.subcategories?.map((sub) => (
                              <Link
                                key={sub.name}
                                href={sub.href}
                                className="block px-4 py-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                                style={{
                                  fontFamily: NAV_MENU_STYLES.fontFamily,
                                  fontWeight: NAV_MENU_STYLES.fontWeight,
                                  fontSize: '12px',
                                }}
                                onClick={() => {
                                  closeDropdown(item.name, 0);
                                }}
                              >
                                {sub.name}
                              </Link>
                            ))}
                          </div>
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
                className="flex h-9 w-9 items-center justify-center rounded-control text-ink-2 transition-colors hover:bg-surface-2"
                aria-label="Toggle search"
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
                className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2"
                aria-label="Cart"
              >
                {/* Plain line-art cart, matching the menu/search/account icons.
                    Replaces a cartoon PNG that was stylistically out of place. */}
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
                    className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full text-[13px] font-bold text-ink md:h-5 md:w-5 md:text-xs"
                    style={{ background: 'var(--brand)' }}
                  >
                    {cartItemCount > 9 ? '9+' : cartItemCount}
                  </span>
                )}
              </Link>

              {user ? (
                <div className="relative flex-shrink-0" ref={accountMenuRef}>
                  <button
                    onClick={() => setIsAccountMenuOpen((open) => !open)}
                    className="flex items-center gap-1 p-1 md:p-2 text-neutral-700 hover:text-primary-700"
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
                    <svg className="hidden md:block h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isAccountMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-neutral-200 bg-white py-2 shadow-lg"
                    >
                      <div className="border-b border-neutral-100 px-4 pb-2 mb-1">
                        <p className="truncate text-sm font-semibold text-neutral-900">
                          {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}
                        </p>
                        <p className="truncate text-xs text-neutral-500">{user.email}</p>
                      </div>
                      <Link
                        href="/dashboard"
                        className="block px-4 py-2 text-sm text-neutral-700 hover:bg-primary-50 hover:text-neutral-900"
                        onClick={() => setIsAccountMenuOpen(false)}
                      >
                        My Account
                      </Link>
                      {user.role === 'ADMIN' && (
                        <Link
                          href="/admin"
                          className="block px-4 py-2 text-sm text-neutral-700 hover:bg-primary-50 hover:text-neutral-900"
                          onClick={() => setIsAccountMenuOpen(false)}
                        >
                          Admin
                        </Link>
                      )}
                      <button
                        onClick={handleLogout}
                        className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                      >
                        Logout
                      </button>
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


        {/* Expanding search bar */}
        {isSearchOpen && (
          <div className="w-full border-t border-line py-2 sm:py-3"><div className="container-fluid">
            <form onSubmit={handleSearch}>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-full border-line bg-surface-2 py-2 pl-4 pr-10 text-sm focus:bg-white"
                  suppressHydrationWarning={true}
                />
                <button
                  type="submit"
                  className="absolute inset-y-0 right-0 flex items-center pr-3"
                  aria-label="Search"
                  suppressHydrationWarning={true}
                >
                  <svg
                    className="h-5 w-5 text-ink-3"
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
              </div>
            </form>
            </div>
          </div>
        )}

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="w-full border-t border-line xl:hidden">
            <nav className="container-fluid py-2 sm:py-3">
              <div className="space-y-1">
                {HEADER_NAVIGATION.map((item) => {
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
                        className="block px-3 py-2 hover:bg-neutral-50 hover:text-primary-600 rounded transition-colors duration-150"
                        style={mobileItemStyle}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {item.name}
                      </Link>
                    );
                  }

                  return (
                    <div key={item.name} className="space-y-1">
                      <button
                        suppressHydrationWarning
                        type="button"
                        onClick={() => handleMobileSubmenuClick(item.name)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-neutral-50 hover:text-primary-600 rounded transition-colors duration-150"
                        style={mobileItemStyle}
                        aria-expanded={isExpanded}
                      >
                        <span>{item.name}</span>
                        <svg
                          className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>

                      {isExpanded && (
                        <div
                          className="pl-4 space-y-1"
                          ref={(el) => {
                            mobileSubmenuRefs.current[item.name] = el;
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {item.subcategories?.map((sub) => (
                            <Link
                              key={sub.name}
                              href={sub.href}
                              className="block px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 hover:text-primary-600 rounded transition-colors duration-150"
                              style={{
                                fontFamily: NAV_MENU_STYLES.fontFamily,
                                fontWeight: NAV_MENU_STYLES.fontWeight,
                                fontSize: '13px',
                              }}
                              onClick={() => {
                                setExpandedMobileSubmenu(null);
                                setIsMobileMenuOpen(false);
                              }}
                            >
                              {sub.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Mobile Auth Buttons */}
              {!user ? (
                <div className="mt-3 pt-3 border-t border-neutral-200">
                  <div className="px-3">
                    <AuthToggleButtons />
                  </div>
                </div>
              ) : (
                <div className="mt-3 pt-3 border-t border-neutral-200 space-y-1">
                  <Link
                    href="/dashboard"
                    className="block px-3 py-2 rounded text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    My Account
                  </Link>
                  {user.role === 'ADMIN' && (
                    <Link
                      href="/admin"
                      className="block px-3 py-2 rounded text-sm font-medium text-neutral-700 hover:bg-neutral-50"
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
                    className="block w-full px-3 py-2 rounded text-left text-sm font-medium text-red-600 hover:bg-red-50"
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
