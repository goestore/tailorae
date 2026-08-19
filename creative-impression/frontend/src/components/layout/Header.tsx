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
  fontSize: '14px',
  mobileFontSize: '15px',
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

export const Header: React.FC = () => {
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
    <header className="sticky top-0 z-40 w-full bg-white shadow-sm">
      <AnnouncementBar />

      {/* Main header */}
      <div className="w-full border-b border-neutral-200">
        <div className="mx-auto w-full max-w-full px-2 sm:px-4 md:px-6 lg:px-8">
          <div className="relative flex h-14 md:h-16 items-center gap-2 md:gap-4">
            {/* Left: mobile menu + desktop navigation */}
            <div className="flex flex-1 items-center gap-2 lg:flex-none">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-1 md:p-2 text-neutral-600 hover:text-primary-600 flex-shrink-0"
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

              <nav className="hidden lg:flex lg:items-center lg:space-x-6">
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
                        className="whitespace-nowrap hover:text-primary-600 transition-colors duration-200"
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
                        className="whitespace-nowrap hover:text-primary-600 transition-colors duration-200 inline-flex items-center gap-1"
                        style={navItemStyle}
                        aria-expanded={isDropdownOpen}
                        aria-haspopup="true"
                      >
                        {item.name}
                        <svg
                          className={`h-3 w-3 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
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

                      {isDropdownOpen && (
                        <div
                          className={`absolute top-full left-0 pt-2 transition-all duration-200 ease-out ${
                            isAnimating ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
                          }`}
                          onMouseEnter={() => openDropdown(item.name)}
                          onMouseLeave={() => closeDropdown(item.name)}
                          style={{ zIndex: 50 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="min-w-[200px] rounded-lg border border-neutral-200 bg-white py-2 shadow-lg">
                            {item.subcategories?.map((sub) => (
                              <Link
                                key={sub.name}
                                href={sub.href}
                                className="block px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 hover:text-primary-600 transition-colors duration-150"
                                style={{
                                  fontFamily: NAV_MENU_STYLES.fontFamily,
                                  fontWeight: NAV_MENU_STYLES.fontWeight,
                                  fontSize: '13px',
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
            </div>

            {/* Center: logo (true viewport center via absolute positioning) */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Link href="/" className="pointer-events-auto flex items-center gap-1 md:gap-2">
                <Image
                  src="/images/IX%20Logo.JPG"
                  alt="Creative Impression Logo"
                  width={28}
                  height={28}
                  className="h-7 w-7 md:h-8 md:w-8 object-contain"
                  priority
                />
                <span
                  className="text-xs sm:text-sm md:text-lg font-semibold text-black whitespace-nowrap"
                  style={{ fontFamily: 'var(--font-playfair)' }}
                >
                  Creative Impression
                </span>
              </Link>
            </div>

            {/* Right: search, cart, auth */}
            <div className="ml-auto flex flex-1 items-center justify-end gap-2 md:gap-3 lg:flex-none">
              <div className="hidden lg:flex lg:max-w-sm lg:px-4">
                <form onSubmit={handleSearch} className="w-full">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-4 pr-10 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      suppressHydrationWarning={true}
                    />
                    <button
                      type="submit"
                      className="absolute inset-y-0 right-0 flex items-center pr-3"
                      suppressHydrationWarning={true}
                    >
                      <svg
                        className="h-5 w-5 text-neutral-400"
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

              <button
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className="lg:hidden p-1 md:p-2 text-neutral-600 hover:text-primary-600"
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
                className="relative p-1 md:p-2 text-neutral-600 hover:text-primary-600 flex-shrink-0"
              >
                <Image
                  src="/images/wishlist%2Bcart.png"
                  alt="Cart"
                  width={24}
                  height={24}
                  className="h-5 w-5 md:h-6 md:w-6 object-contain"
                />
                {cartItemCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 md:h-5 md:w-5 items-center justify-center rounded-full bg-primary-500 text-xs font-semibold text-black">
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
                <div className="hidden sm:flex sm:items-center sm:gap-1 md:gap-2 flex-shrink-0">
                  <AuthToggleButtons />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile search bar */}
        {isSearchOpen && (
          <div className="w-full border-t border-neutral-200 px-2 py-2 md:px-4 sm:py-3 lg:hidden">
            <form onSubmit={handleSearch}>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-4 pr-10 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  suppressHydrationWarning={true}
                />
                <button
                  type="submit"
                  className="absolute inset-y-0 right-0 flex items-center pr-3"
                  suppressHydrationWarning={true}
                >
                  <svg
                    className="h-5 w-5 text-neutral-400"
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
        )}

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="w-full border-t border-neutral-200 lg:hidden">
            <nav className="px-2 py-2 md:px-4 sm:py-3">
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
                                fontSize: '14px',
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
