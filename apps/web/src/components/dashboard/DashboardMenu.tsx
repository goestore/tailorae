'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/common';

export interface DashboardMenuProps {
  activeSection?: string;
  onSectionChange?: (section: string) => void;
}

/**
 * Tabs switch a panel in place; entries with an `href` are their own routes.
 * Both live in one list so the account nav reads as one thing to the shopper.
 */
const menuItems: Array<{ id: string; label: string; href?: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'orders', label: 'Orders' },
  { id: 'addresses', label: 'Addresses', href: '/dashboard/addresses' },
  { id: 'wishlist', label: 'Wishlist', href: '/wishlist' },
  { id: 'business', label: 'Business & bulk', href: '/b2b/account' },
  { id: 'seller', label: 'Sell', href: '/seller' },
  { id: 'profile', label: 'Profile' },
  { id: 'settings', label: 'Settings' },
  { id: 'logout', label: 'Sign out' },
];

export const DashboardMenu: React.FC<DashboardMenuProps> = ({
  activeSection = 'overview',
  onSectionChange,
}) => {
  return (
    <Card className="h-fit p-2 md:sticky md:top-20">
      <nav className="flex gap-1 overflow-x-auto md:block md:space-y-1">
        {menuItems.map((item) => {
          const className = `shrink-0 px-3 py-2.5 text-left text-sm transition-colors md:w-full ${
            activeSection === item.id ? 'bg-ink text-white' : 'text-ink-2 hover:bg-surface-2'
          }`;

          return item.href ? (
            <Link key={item.id} href={item.href} className={`${className} md:block`}>
              {item.label}
            </Link>
          ) : (
            <button key={item.id} onClick={() => onSectionChange?.(item.id)} className={className}>
              {item.label}
            </button>
          );
        })}
      </nav>
    </Card>
  );
};
