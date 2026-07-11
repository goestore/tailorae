'use client';

import React from 'react';
import { Card } from '@/components/common';

export interface DashboardMenuProps {
  activeSection?: string;
  onSectionChange?: (section: string) => void;
}

const menuItems = [
  { id: 'overview', label: 'Dashboard Overview', icon: '📊' },
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'orders', label: 'Order History', icon: '📦' },
  { id: 'addresses', label: 'Saved Addresses', icon: '📍' },
  { id: 'designs', label: 'Saved Designs', icon: '🎨' },
  { id: 'settings', label: 'Account Settings', icon: '⚙️' },
  { id: 'logout', label: 'Logout', icon: '🚪' },
];

export const DashboardMenu: React.FC<DashboardMenuProps> = ({
  activeSection = 'overview',
  onSectionChange,
}) => {
  return (
    <Card className="p-4 h-fit sticky top-20">
      <nav className="space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSectionChange?.(item.id)}
            className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
              activeSection === item.id
                ? 'bg-primary-600 text-white font-semibold'
                : 'hover:bg-gray-100'
            }`}
          >
            <span className="mr-2">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </Card>
  );
};
