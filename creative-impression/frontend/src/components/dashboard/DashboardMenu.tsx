'use client';

import React from 'react';
import { Card } from '@/components/common';

export interface DashboardMenuProps {
  activeSection?: string;
  onSectionChange?: (section: string) => void;
}

const menuItems = [
  { id: 'overview', label: 'Overview' },
  { id: 'orders', label: 'Orders' },
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
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSectionChange?.(item.id)}
            className={`shrink-0 px-3 py-2.5 text-left text-sm transition-colors md:w-full ${
              activeSection === item.id
                ? 'bg-ink text-white'
                : 'text-ink-2 hover:bg-surface-2'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </Card>
  );
};
