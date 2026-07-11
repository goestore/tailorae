'use client';

import React from 'react';
import { Card, Button } from '@/components/common';

export interface CustomizationPreviewProps {
  productName?: string;
  productImage?: string;
  customizationOptions?: Record<string, string | number>;
  price?: number;
}

export const CustomizationPreview: React.FC<CustomizationPreviewProps> = ({
  productName = 'Custom Product',
  productImage = '/images/product-preview.jpg',
  customizationOptions = {},
  price = 0,
}) => {
  return (
    <Card className="p-6">
      <h3 className="text-xl font-bold mb-4">Preview</h3>

      <div
        className="w-full h-80 bg-cover bg-center rounded-lg mb-4 border-2 border-dashed border-gray-300"
        style={{ backgroundImage: `url('${productImage}')` }}
      />

      <h4 className="text-lg font-semibold mb-2">{productName}</h4>

      <div className="bg-gray-50 p-4 rounded-lg mb-4">
        <h5 className="font-semibold mb-3">Customization Details:</h5>
        <div className="space-y-2 text-sm">
          {Object.entries(customizationOptions).map(([key, value]) => (
            <div key={key} className="flex justify-between">
              <span className="text-gray-600">{key}:</span>
              <span className="font-medium">{String(value)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <span className="text-lg font-bold">Total Price:</span>
        <span className="text-2xl font-bold text-primary-600">₹{price}</span>
      </div>

      <Button fullWidth variant="primary" size="lg">
        Add to Cart
      </Button>
    </Card>
  );
};
