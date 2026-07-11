'use client';

import React from 'react';
import { Card } from '@/components/common';

export interface B2BPricingTier {
  quantity: number;
  discount: number;
  pricePerUnit: number;
}

export interface QuantityDiscountsProps {
  basePricePerUnit: number;
  tiers: B2BPricingTier[];
  selectedQuantity?: number;
}

export const QuantityDiscounts: React.FC<QuantityDiscountsProps> = ({
  basePricePerUnit,
  tiers,
  selectedQuantity = 1,
}) => {
  return (
    <Card className="p-6">
      <h3 className="text-xl font-bold mb-4">Bulk Pricing</h3>

      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2 font-bold text-sm border-b pb-2 mb-2">
          <span>Quantity</span>
          <span>Discount</span>
          <span>Price/Unit</span>
        </div>

        {tiers.map((tier, index) => (
          <div
            key={index}
            className={`grid grid-cols-3 gap-2 p-2 rounded text-sm ${
              selectedQuantity >= tier.quantity ? 'bg-primary-100' : 'bg-gray-50'
            }`}
          >
            <span>
              {tier.quantity} {index === 0 ? '' : `- ${tiers[index + 1]?.quantity - 1 || '+'}`}
            </span>
            <span className="text-green-600 font-semibold">{tier.discount}% OFF</span>
            <span className="font-bold">₹{tier.pricePerUnit}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 p-4 bg-blue-50 rounded-lg text-sm">
        <p>
          Selected Quantity: <strong>{selectedQuantity}</strong>
        </p>
        <p className="mt-1">
          Total Price:{' '}
          <strong className="text-primary-600">
            ₹{(basePricePerUnit * selectedQuantity).toFixed(2)}
          </strong>
        </p>
      </div>
    </Card>
  );
};
