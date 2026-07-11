'use client';

import React, { useState } from 'react';
import { DashboardMenu, OrderHistory } from '@/components/dashboard';

const MOCK_ORDERS = [
  {
    id: 'ORD-001',
    date: '2024-05-01',
    status: 'delivered' as const,
    total: 1299,
    itemCount: 3,
  },
  {
    id: 'ORD-002',
    date: '2024-04-28',
    status: 'shipped' as const,
    total: 899,
    itemCount: 2,
  },
];

export default function DashboardPage() {
  const [activeSection, setActiveSection] = useState('overview');

  return (
    <main className="py-8 md:py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-8">My Account</h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Sidebar Menu */}
          <div className="md:col-span-1">
            <DashboardMenu
              activeSection={activeSection}
              onSectionChange={setActiveSection}
            />
          </div>

          {/* Content Area */}
          <div className="md:col-span-3">
            {activeSection === 'overview' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-lg shadow">
                  <h3 className="text-gray-600 text-sm font-semibold mb-2">Total Orders</h3>
                  <p className="text-3xl font-bold">12</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <h3 className="text-gray-600 text-sm font-semibold mb-2">Total Spent</h3>
                  <p className="text-3xl font-bold">₹15,999</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <h3 className="text-gray-600 text-sm font-semibold mb-2">Loyalty Points</h3>
                  <p className="text-3xl font-bold">1,599</p>
                </div>
              </div>
            )}

            {activeSection === 'orders' && (
              <OrderHistory
                orders={MOCK_ORDERS}
                onOrderClick={(orderId) => console.log('View order:', orderId)}
              />
            )}

            {activeSection === 'profile' && (
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-2xl font-bold mb-6">Profile Information</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value="John Doe"
                      className="w-full border border-gray-300 rounded px-4 py-2"
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value="john@example.com"
                      className="w-full border border-gray-300 rounded px-4 py-2"
                      readOnly
                    />
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'settings' && (
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-2xl font-bold mb-6">Account Settings</h2>
                <div className="space-y-4">
                  <label className="flex items-center">
                    <input type="checkbox" defaultChecked className="mr-3" />
                    <span>Receive promotional emails</span>
                  </label>
                  <label className="flex items-center">
                    <input type="checkbox" defaultChecked className="mr-3" />
                    <span>Receive order updates via SMS</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
