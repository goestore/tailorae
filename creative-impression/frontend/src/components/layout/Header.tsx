"use client";

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

export const Header: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { items: cartItems } = useSelector((state: RootState) => state.cart);

  const cartItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const navigation = [
    { name: 'Home', href: '/' },
    { name: 'New Arrivals', href: '/products?sortBy=newest' },
    { name: 'T-Shirts', href: '/products?category=t-shirts' },
    { name: 'Polo', href: '/products?category=polo' },
    { name: 'Hoodies', href: '/products?category=hoodies-sweatshirts' },
    { name: 'Corporate', href: '/products?category=corporate-uniforms' },
    { name: 'Custom Wear', href: '/customization' },
    { name: 'B2B', href: '/b2b' },
  ];

  useEffect(() => {
    if (!isAccountMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAccountMenuOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (query) {
      router.push(`/products?search=${encodeURIComponent(query)}`);
      setIsSearchOpen(false);
      setIsMobileMenuOpen(false);
    }
  };

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
                <svg className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {isMobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>

              <nav className="hidden lg:flex lg:items-center lg:space-x-6">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="whitespace-nowrap hover:text-primary-600"
                    style={{
                      color: NAV_MENU_STYLES.color,
                      fontSize: NAV_MENU_STYLES.fontSize,
                      fontFamily: NAV_MENU_STYLES.fontFamily,
                      fontWeight: NAV_MENU_STYLES.fontWeight,
                    }}
                  >
                    {item.name}
                  </Link>
                ))}
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
                <span className="text-xs sm:text-sm md:text-lg font-semibold text-black whitespace-nowrap" style={{ fontFamily: 'var(--font-playfair)' }}>
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
                      <svg className="h-5 w-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
                <svg className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              <Link href="/cart" className="relative p-1 md:p-2 text-neutral-600 hover:text-primary-600 flex-shrink-0">
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
                  <svg className="h-5 w-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="block px-3 py-2 hover:bg-neutral-50 hover:text-primary-600 rounded"
                    style={{
                      color: NAV_MENU_STYLES.color,
                      fontSize: NAV_MENU_STYLES.mobileFontSize,
                      fontFamily: NAV_MENU_STYLES.fontFamily,
                      fontWeight: NAV_MENU_STYLES.fontWeight,
                    }}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.name}
                  </Link>
                ))}
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