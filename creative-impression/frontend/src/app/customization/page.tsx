'use client';

import React from 'react';
import { CustomizationPreview } from '@/components/customization';
import { Card, Button } from '@/components/common';

export default function CustomizationPage() {
  return (
    <main className="py-8 md:py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-8">Custom Printing</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Customization Options */}
          <div className="md:col-span-2">
            <Card className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Product
                </label>
                <select className="w-full border border-gray-300 rounded px-4 py-2">
                  <option>Business Cards</option>
                  <option>T-Shirts</option>
                  <option>Posters</option>
                  <option>Mugs</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload Design
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <p className="text-gray-600">
                    Drag and drop your design here or{' '}
                    <button className="text-primary-600 font-semibold hover:underline">
                      click to browse
                    </button>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Size
                  </label>
                  <select className="w-full border border-gray-300 rounded px-4 py-2">
                    <option>Small</option>
                    <option>Medium</option>
                    <option>Large</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity
                  </label>
                  <input
                    type="number"
                    defaultValue={1}
                    className="w-full border border-gray-300 rounded px-4 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color
                </label>
                <select className="w-full border border-gray-300 rounded px-4 py-2">
                  <option>Black</option>
                  <option>White</option>
                  <option>Red</option>
                  <option>Blue</option>
                </select>
              </div>
            </Card>
          </div>

          {/* Preview */}
          <CustomizationPreview
            productName="Custom Business Cards"
            price={399}
            customizationOptions={{
              'Size': 'Standard',
              'Quantity': '100',
              'Color': 'Black on White',
            }}
          />
        </div>
      </div>
    </main>
  );
}
