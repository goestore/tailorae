"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSelector } from 'react-redux';
import { Button } from '@/components/common';
import { RootState } from '@/store';
import { formatCurrency } from '@/utils/helpers';
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
  const [searchQuery, setSearchQuery] = useState('');

  const { user } = useSelector((state: RootState) => state.auth);
  const { items: cartItems, total } = useSelector((state: RootState) => state.cart);

  const cartItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const navigation = [
    { name: 'Home', href: '/' },
    { name: 'New Arrivals', href: '/products/new-arrivals' },
    { name: 'Womens', href: '/products/womens' },
    { name: 'Mens', href: '/products/mens' },
    { name: 'Kids', href: '/products/kids' },
    { name: 'Sale', href: '/products/sale' },
    { name: 'Custom Wear', href: '/custom-printing' },
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // TODO: Implement search navigation
      console.log('Searching for:', searchQuery);
    }
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
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 md:h-5 md:w-5 items-center justify-center rounded-full bg-primary-600 text-xs text-white">
                    {cartItemCount > 9 ? '9+' : cartItemCount}
                  </span>
                )}
              </Link>

              {user ? (
                <button className="p-1 md:p-2 text-neutral-600 hover:text-primary-600 flex-shrink-0" suppressHydrationWarning={true}>
                  <svg className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </button>
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
              {!user && (
                <div className="mt-3 pt-3 border-t border-neutral-200">
                  <div className="px-3">
                    <AuthToggleButtons />
                  </div>
                </div>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};