'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export const Footer: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const currentYear = new Date().getFullYear();

  const footerSections = [
    {
      title: 'Company',
      links: [
        { name: 'About Us', href: '/about' },
        { name: 'Careers', href: '/careers' },
        { name: 'Press', href: '/press' },
        { name: 'Blog', href: '/blog' },
      ],
    },
    {
      title: 'Products',
      links: [
        { name: 'Business Cards', href: '/products/business-cards' },
        { name: 'Flyers & Posters', href: '/products/flyers-posters' },
        { name: 'T-Shirts', href: '/products/t-shirts' },
        { name: 'Custom Printing', href: '/custom-printing' },
        { name: 'Bulk Orders', href: '/b2b' },
      ],
    },
    {
      title: 'Support',
      links: [
        { name: 'Help Center', href: '/help' },
        { name: 'Contact Us', href: '/contact' },
        { name: 'Size Guide', href: '/size-guide' },
        { name: 'Track Order', href: '/track-order' },
        { name: 'Returns', href: '/returns' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { name: 'Privacy Policy', href: '/privacy' },
        { name: 'Terms of Service', href: '/terms' },
        { name: 'Cookie Policy', href: '/cookies' },
        { name: 'GDPR', href: '/gdpr' },
      ],
    },
  ];

  const socialLinks = [
    {
      name: 'Facebook',
      href: '#',
      icon: (
        <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      ),
    },
    {
      name: 'Instagram',
      href: '#',
      icon: (
        <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12.017 0C8.396 0 7.609.035 6.298.129c-1.31.094-2.207.447-2.996.956C2.509 1.59 1.894 2.395 1.43 3.184c-.509.789-.862 1.686-.956 2.996C.035 7.609 0 8.396 0 12.017s.035 4.408.129 5.719c.094 1.31.447 2.207.956 2.996.464.789 1.079 1.594 1.868 2.068.789.509 1.686.862 2.996.956 1.31.094 2.098.129 5.719.129s4.408-.035 5.719-.129c1.31-.094 2.207-.447 2.996-.956.789-.474 1.404-1.279 1.868-2.068.509-.789.862-1.686.956-2.996.094-1.31.129-2.098.129-5.719s-.035-4.408-.129-5.719c-.094-1.31-.447-2.207-.956-2.996C21.491 2.509 20.786 1.894 20.017 1.43c-.789-.509-1.686-.862-2.996-.956C16.408.035 15.621 0 12.017 0zm0 2.163c3.527 0 3.947.013 5.34.097 1.235.075 1.907.334 2.337.553.552.287.948.633 1.367 1.052.419.419.765.815 1.052 1.367.219.43.478 1.102.553 2.337.084 1.393.097 1.813.097 5.34s-.013 3.947-.097 5.34c-.075 1.235-.334 1.907-.553 2.337-.287.552-.633.948-1.052 1.367-.419.419-.815.765-1.367 1.052-.43.219-1.102.478-2.337.553-1.393.084-1.813.097-5.34.097s-3.947-.013-5.34-.097c-1.235-.075-1.907-.334-2.337-.553-.552-.287-.948-.633-1.367-1.052-.419-.419-.765-.815-1.052-1.367-.219-.43-.478-1.102-.553-2.337-.084-1.393-.097-1.813-.097-5.34s.013-3.947.097-5.34c.075-1.235.334-1.907.553-2.337.287-.552.633-.948 1.052-1.367.419-.419.815-.765 1.367-1.052.43-.219 1.102-.478 2.337-.553 1.393-.084 1.813-.097 5.34-.097zm0 3.979c-3.632 0-6.577 2.945-6.577 6.577S8.385 19.296 12.017 19.296s6.577-2.945 6.577-6.577-2.945-6.577-6.577-6.577zM12.017 15.75c-2.484 0-4.5-2.016-4.5-4.5s2.016-4.5 4.5-4.5 4.5 2.016 4.5 4.5-2.016 4.5-4.5 4.5zm6.53-8.728c0 .846-.685 1.531-1.531 1.531-.846 0-1.531-.685-1.531-1.531 0-.846.685-1.531 1.531-1.531.846 0 1.531.685 1.531 1.531z"/>
        </svg>
      ),
    },
    {
      name: 'Twitter',
      href: '#',
      icon: (
        <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
        </svg>
      ),
    },
    {
      name: 'LinkedIn',
      href: '#',
      icon: (
        <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
      ),
    },
  ];

  return (
    <footer className="bg-neutral-900 text-white">
      {/* Main footer content */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-5">
          {/* Company info */}
          <div className="lg:col-span-2">
            <div className="flex items-center">
              <Image
                src="/images/IX%20Logo.JPG"
                alt="Creative Impression Logo"
                width={32}
                height={32}
                className="object-contain"
              />
              <span className="ml-2 text-xl font-bold">Creative Impression</span>
            </div>
            <p className="mt-4 text-neutral-300">
              Your trusted partner for custom printing and business solutions.
              From business cards to bulk orders, we deliver quality products
              with exceptional service.
            </p>
            <div className="mt-6 flex space-x-4">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  className="text-neutral-400 hover:text-white"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {social.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Footer sections */}
          {footerSections.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold uppercase tracking-wider">
                {section.title}
              </h3>
              <ul className="mt-4 space-y-2">
                {section.links.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className="text-neutral-300 hover:text-white"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Newsletter signup */}
      <div className="border-t border-neutral-800">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="md:flex md:items-center md:justify-between">
            <div className="md:flex-1">
              <h3 className="text-lg font-medium">Stay updated</h3>
              <p className="mt-1 text-neutral-300">
                Get the latest updates on new products and exclusive offers.
              </p>
            </div>
            <div className="mt-4 md:mt-0 md:ml-8">
              <form 
                className="sm:flex"
                onSubmit={(e) => {
                  e.preventDefault();
                  setIsLoading(true);
                  // Handle newsletter signup here
                  setTimeout(() => {
                    setEmail('');
                    setIsLoading(false);
                  }, 1000);
                }}
              >
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-4 py-2 text-white placeholder-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:max-w-xs"
                  suppressHydrationWarning={true}
                  required
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="mt-3 w-full rounded-md bg-primary-600 px-4 py-2 font-medium text-white hover:bg-primary-700 sm:mt-0 sm:ml-3 sm:w-auto sm:flex-shrink-0 disabled:opacity-50"
                  suppressHydrationWarning={true}
                >
                  {isLoading ? 'Loading...' : 'Subscribe'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-neutral-800">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between space-y-4 md:flex-row md:space-y-0">
            <div className="text-sm text-neutral-400">
              © {currentYear} Creative Impression. All rights reserved.
            </div>
            <div className="flex items-center space-x-6 text-sm text-neutral-400">
              <span>🇮🇳 Made with ❤️ in India</span>
              <span>•</span>
              <span>Secure payments</span>
              <span>•</span>
              <span>24/7 support</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};