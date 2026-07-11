"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSelector } from 'react-redux';
import { Button } from '@/components/common';
import { RootState } from '@/store';
import { formatCurrency } from '@/utils/helpers';
import { AuthToggleButtons } from './AuthToggleButtons';

export const NavigationBar: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { user } = useSelector((state: RootState) => state.auth);
  const { items: cartItems, total } = useSelector((state: RootState) => state.cart);

  const cartItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const navigation = [
    { name: 'Home', href: '/' },
    { name: 'Products', href: '/products' },
    { name: 'Custom Printing', href: '/customization' },
    { name: 'B2B', href: '/b2b' },
    { name: 'About', href: '/info/about' },
    { name: 'Contact', href: '/info/contact' },
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // TODO: Implement search navigation
      console.log('Searching for:', searchQuery);
    }
  };

  return (
    <header className="bg-white shadow-sm">
      {/* Main navigation */}
      <div className="border-b border-neutral-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            
            {/* 1. Mobile Hamburger Menu (Left) */}
            <div className="flex flex-1 md:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="-ml-2 p-2 text-neutral-600 hover:text-primary-600"
                suppressHydrationWarning={true}
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {isMobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>

            {/* 2. Logo (Center on mobile, Left on desktop) */}
            <div className="flex flex-1 justify-center md:flex-none md:justify-start flex-shrink-0">
              <Link href="/" className="flex items-center">
                <Image
                  src="/images/IX%20Logo.JPG"
                  alt="Creative Impression Logo"
                  width={32}
                  height={32}
                  className="object-contain"
                  priority
                />
                {/* Added whitespace-nowrap and responsive text size to prevent mobile wrapping issues */}
                <span className="ml-2 text-lg sm:text-xl font-bold text-black whitespace-nowrap">
                  Creative Impression
                </span>
              </Link>
            </div>

            {/* 3. Desktop Navigation */}
            <nav className="hidden md:flex md:space-x-8">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className="text-neutral-600 hover:text-primary-600"
                >
                  {item.name}
                </Link>
              ))}
            </nav>

            {/* 4. Desktop Search Bar */}
            <div className="hidden lg:flex lg:flex-1 lg:justify-center lg:px-8">
              <form onSubmit={handleSearch} className="w-full max-w-md">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-4 pr-10 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
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

            {/* 5. Right side actions (Search, Cart, User) */}
            <div className="flex flex-1 items-center justify-end space-x-4 md:flex-none">
              {/* Mobile search toggle */}
              <button
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className="lg:hidden text-neutral-600 hover:text-primary-600"
                suppressHydrationWarning={true}
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              {/* Cart */}
              <Link href="/cart" className="relative text-neutral-600 hover:text-primary-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.1 5H19M7 13l-1.1 5M7 13l1.1-5m8.9 5L17 8m2 5v8a2 2 0 01-2 2H9a2 2 0 01-2-2v-8m10 0V6a2 2 0 00-2-2H9a2 2 0 00-2 2v1.01" />
                </svg>
                {cartItemCount > 0 && (
                  <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-xs text-white">
                    {cartItemCount}
                  </span>
                )}
              </Link>

              {/* User menu */}
              {user ? (
                <div className="relative">
                  <Link href="/dashboard" className="flex items-center text-neutral-600 hover:text-primary-600">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </Link>
                </div>
              ) : (
                <AuthToggleButtons />
              )}
            </div>
          </div>
        </div>

        {/* Mobile search bar */}
        {isSearchOpen && (
          <div className="border-t border-neutral-200 px-4 py-3 lg:hidden">
            <form onSubmit={handleSearch}>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-4 pr-10 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
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
          <div className="border-t border-neutral-200 md:hidden">
            <nav className="px-4 py-3">
              <div className="space-y-1">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="block rounded-md px-3 py-2 text-base font-medium text-neutral-600 hover:bg-neutral-100 hover:text-primary-600"
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};