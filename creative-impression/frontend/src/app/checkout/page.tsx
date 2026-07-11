'use client';

import React, { useState } from 'react';
import { CheckoutSteps } from '@/components/checkout';
import { Card, Button } from '@/components/common';

const CHECKOUT_STEPS = [
  { id: 'shipping', name: 'Shipping', label: 'Shipping' },
  { id: 'payment', name: 'Payment', label: 'Payment' },
  { id: 'review', name: 'Review', label: 'Review' },
];

export default function CheckoutPage() {
  const [currentStep, setCurrentStep] = useState('shipping');

  return (
    <main className="py-8 md:py-12 lg:py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-8">Checkout</h1>

        <CheckoutSteps
          steps={CHECKOUT_STEPS}
          currentStep={currentStep}
          onStepClick={setCurrentStep}
        />

        <Card className="p-8">
          {currentStep === 'shipping' && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Shipping Address</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <input
                  type="text"
                  placeholder="First Name"
                  className="border border-gray-300 rounded px-4 py-2"
                />
                <input
                  type="text"
                  placeholder="Last Name"
                  className="border border-gray-300 rounded px-4 py-2"
                />
                <input
                  type="text"
                  placeholder="Address"
                  className="border border-gray-300 rounded px-4 py-2 md:col-span-2"
                />
                <input
                  type="text"
                  placeholder="City"
                  className="border border-gray-300 rounded px-4 py-2"
                />
                <input
                  type="text"
                  placeholder="ZIP Code"
                  className="border border-gray-300 rounded px-4 py-2"
                />
              </div>
              <Button
                fullWidth
                variant="primary"
                size="lg"
                onClick={() => setCurrentStep('payment')}
              >
                Continue to Payment
              </Button>
            </div>
          )}

          {currentStep === 'payment' && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Payment Method</h2>
              <div className="space-y-4 mb-6">
                <label className="flex items-center p-4 border border-gray-300 rounded cursor-pointer">
                  <input type="radio" name="payment" defaultChecked className="mr-3" />
                  <span>Credit/Debit Card</span>
                </label>
                <label className="flex items-center p-4 border border-gray-300 rounded cursor-pointer">
                  <input type="radio" name="payment" className="mr-3" />
                  <span>UPI</span>
                </label>
                <label className="flex items-center p-4 border border-gray-300 rounded cursor-pointer">
                  <input type="radio" name="payment" className="mr-3" />
                  <span>Net Banking</span>
                </label>
              </div>
              <Button
                fullWidth
                variant="primary"
                size="lg"
                onClick={() => setCurrentStep('review')}
              >
                Review Order
              </Button>
            </div>
          )}

          {currentStep === 'review' && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Review Your Order</h2>
              <div className="bg-gray-50 p-4 rounded mb-6">
                <p className="text-gray-700">Order summary details go here</p>
              </div>
              <Button fullWidth variant="primary" size="lg">
                Place Order
              </Button>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
