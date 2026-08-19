'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { CheckoutSteps } from '@/components/checkout';
import { Card, Button, Input, LoadingSpinner } from '@/components/common';
import { apiClient } from '@/lib/api-client';
import { calculateShipping, getApiErrorMessage } from '@/lib/api-utils';
import { formatCurrency } from '@/utils/helpers';
import { AppDispatch } from '@/store';
import { clearCart } from '@/store/slices/cart';

const CHECKOUT_STEPS = [
  { id: 'shipping', name: 'Shipping', label: 'Shipping' },
  { id: 'payment', name: 'Payment', label: 'Payment' },
  { id: 'review', name: 'Review', label: 'Review' },
];

interface CheckoutCartItem {
  id: string;
  quantity: number;
  price: number;
  product: { id: string; name: string };
}

interface ShippingForm {
  fullName: string;
  phoneNumber: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

const EMPTY_FORM: ShippingForm = {
  fullName: '',
  phoneNumber: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'India',
};

const REQUIRED_FIELDS: Array<{ key: keyof ShippingForm; label: string }> = [
  { key: 'fullName', label: 'Full Name' },
  { key: 'phoneNumber', label: 'Phone Number' },
  { key: 'addressLine1', label: 'Address Line 1' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postalCode', label: 'Postal Code' },
  { key: 'country', label: 'Country' },
];

export default function CheckoutPage() {
  const dispatch = useDispatch<AppDispatch>();

  const [currentStep, setCurrentStep] = useState('shipping');
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [cartItems, setCartItems] = useState<CheckoutCartItem[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const [form, setForm] = useState<ShippingForm>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ShippingForm, string>>>({});
  const [couponCode, setCouponCode] = useState('');
  const [notes, setNotes] = useState('');

  const [isPlacing, setIsPlacing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<{ orderNumber: string; total: number } | null>(
    null
  );

  useEffect(() => {
    const token = localStorage.getItem('token');
    setHasToken(Boolean(token));
    if (!token) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    apiClient
      .get('/cart')
      .then((res) => {
        if (cancelled) return;
        const cart = res.data?.data?.cart;
        setCartItems(cart?.items ?? []);
        setSubtotal(
          cart?.subtotal ??
            (cart?.items ?? []).reduce(
              (sum: number, item: CheckoutCartItem) => sum + item.price * item.quantity,
              0
            )
        );
      })
      .catch(() => {
        /* an empty cart view is shown below */
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Estimated discount preview; the backend is authoritative when placing the order.
  const estimatedDiscount = useMemo(() => {
    if (couponCode.trim().toUpperCase() === 'WELCOME10' && subtotal >= 499) {
      return Math.round(subtotal * 0.1);
    }
    return 0;
  }, [couponCode, subtotal]);

  const shipping = cartItems.length > 0 ? calculateShipping(subtotal, estimatedDiscount) : 0;
  const total = subtotal - estimatedDiscount + shipping;

  const setField = (key: keyof ShippingForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validateShipping = (): boolean => {
    const errors: Partial<Record<keyof ShippingForm, string>> = {};
    REQUIRED_FIELDS.forEach(({ key, label }) => {
      if (!form[key].trim()) errors[key] = `${label} is required`;
    });
    if (form.phoneNumber.trim() && !/^[0-9+\-\s]{7,15}$/.test(form.phoneNumber.trim())) {
      errors.phoneNumber = 'Enter a valid phone number';
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = 'Enter a valid email address';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const goToPayment = () => {
    if (validateShipping()) setCurrentStep('payment');
  };

  const placeOrder = async () => {
    setIsPlacing(true);
    setOrderError(null);
    try {
      const payload: Record<string, unknown> = {
        shippingAddress: {
          fullName: form.fullName.trim(),
          phoneNumber: form.phoneNumber.trim(),
          ...(form.email.trim() ? { email: form.email.trim() } : {}),
          addressLine1: form.addressLine1.trim(),
          ...(form.addressLine2.trim() ? { addressLine2: form.addressLine2.trim() } : {}),
          city: form.city.trim(),
          state: form.state.trim(),
          postalCode: form.postalCode.trim(),
          country: form.country.trim(),
        },
        paymentMethod: 'COD',
        ...(couponCode.trim() ? { couponCode: couponCode.trim().toUpperCase() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      const res = await apiClient.post('/orders', payload);
      const order = res.data?.data?.order;
      dispatch(clearCart());
      setPlacedOrder({ orderNumber: order?.orderNumber ?? '—', total: order?.total ?? total });
      toast.success('Order placed successfully');
    } catch (err) {
      const message = getApiErrorMessage(err, 'Could not place your order. Please try again.');
      setOrderError(message);
      toast.error(message);
    } finally {
      setIsPlacing(false);
    }
  };

  if (hasToken === null || isLoading) {
    return <LoadingSpinner className="min-h-[50vh]" size="lg" />;
  }

  if (hasToken === false) {
    return (
      <main className="py-16">
        <div className="mx-auto max-w-lg px-4 text-center">
          <Card className="p-10">
            <h1 className="text-3xl font-bold mb-3">Checkout</h1>
            <p className="text-neutral-600 mb-6">Please sign in to complete your order.</p>
            <Link href="/auth/login?redirect=/checkout">
              <Button variant="primary" size="lg" fullWidth>
                Sign In
              </Button>
            </Link>
          </Card>
        </div>
      </main>
    );
  }

  // Confirmation view after a successful order
  if (placedOrder) {
    return (
      <main className="py-16">
        <div className="mx-auto max-w-lg px-4 text-center">
          <Card className="p-10">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-3xl">
              ✓
            </div>
            <h1 className="text-3xl font-bold mb-2">Order Confirmed!</h1>
            <p className="text-neutral-600 mb-1">Thank you for your order.</p>
            <p className="mb-6">
              Order number:{' '}
              <span className="font-bold text-neutral-900">{placedOrder.orderNumber}</span>
            </p>
            <p className="mb-6 text-sm text-neutral-600">
              Payment: Cash on Delivery • Total {formatCurrency(placedOrder.total)}
            </p>
            <Link href="/dashboard?tab=orders">
              <Button variant="primary" size="lg" fullWidth>
                View My Orders
              </Button>
            </Link>
            <Link href="/products" className="mt-3 block">
              <Button variant="ghost" fullWidth>
                Continue Shopping
              </Button>
            </Link>
          </Card>
        </div>
      </main>
    );
  }

  if (cartItems.length === 0) {
    return (
      <main className="py-16">
        <div className="mx-auto max-w-lg px-4 text-center">
          <Card className="p-10">
            <h1 className="text-3xl font-bold mb-3">Checkout</h1>
            <p className="text-neutral-600 mb-6">Your cart is empty.</p>
            <Link href="/products">
              <Button variant="primary" size="lg" fullWidth>
                Shop Products
              </Button>
            </Link>
          </Card>
        </div>
      </main>
    );
  }

  const stepIndex = CHECKOUT_STEPS.findIndex((s) => s.id === currentStep);

  return (
    <main className="py-8 md:py-12 lg:py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-8">Checkout</h1>

        <CheckoutSteps
          steps={CHECKOUT_STEPS}
          currentStep={currentStep}
          onStepClick={(stepId) => {
            // Only allow going back to already-completed steps.
            const targetIndex = CHECKOUT_STEPS.findIndex((s) => s.id === stepId);
            if (targetIndex < stepIndex) setCurrentStep(stepId);
          }}
        />

        <Card className="p-8">
          {currentStep === 'shipping' && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Shipping Address</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <Input
                  label="Full Name *"
                  value={form.fullName}
                  onChange={(e) => setField('fullName', e.target.value)}
                  error={fieldErrors.fullName}
                  placeholder="Full name"
                />
                <Input
                  label="Phone Number *"
                  type="tel"
                  value={form.phoneNumber}
                  onChange={(e) => setField('phoneNumber', e.target.value)}
                  error={fieldErrors.phoneNumber}
                  placeholder="10-digit phone number"
                />
                <div className="md:col-span-2">
                  <Input
                    label="Email (optional)"
                    type="email"
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                    error={fieldErrors.email}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="md:col-span-2">
                  <Input
                    label="Address Line 1 *"
                    value={form.addressLine1}
                    onChange={(e) => setField('addressLine1', e.target.value)}
                    error={fieldErrors.addressLine1}
                    placeholder="House / building, street"
                  />
                </div>
                <div className="md:col-span-2">
                  <Input
                    label="Address Line 2 (optional)"
                    value={form.addressLine2}
                    onChange={(e) => setField('addressLine2', e.target.value)}
                    placeholder="Landmark, area"
                  />
                </div>
                <Input
                  label="City *"
                  value={form.city}
                  onChange={(e) => setField('city', e.target.value)}
                  error={fieldErrors.city}
                  placeholder="City"
                />
                <Input
                  label="State *"
                  value={form.state}
                  onChange={(e) => setField('state', e.target.value)}
                  error={fieldErrors.state}
                  placeholder="State"
                />
                <Input
                  label="Postal Code *"
                  value={form.postalCode}
                  onChange={(e) => setField('postalCode', e.target.value)}
                  error={fieldErrors.postalCode}
                  placeholder="PIN code"
                />
                <Input
                  label="Country *"
                  value={form.country}
                  onChange={(e) => setField('country', e.target.value)}
                  error={fieldErrors.country}
                  placeholder="Country"
                />
              </div>
              <Button fullWidth variant="primary" size="lg" onClick={goToPayment}>
                Continue to Payment
              </Button>
            </div>
          )}

          {currentStep === 'payment' && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Payment Method</h2>
              <div className="space-y-4 mb-6">
                <label className="flex items-center p-4 border-2 border-primary-500 bg-primary-50 rounded-lg cursor-pointer">
                  <input type="radio" name="payment" checked readOnly className="mr-3" />
                  <div>
                    <span className="font-semibold">Cash on Delivery (COD)</span>
                    <p className="text-sm text-neutral-600">Pay in cash when your order arrives.</p>
                  </div>
                </label>
                <label className="flex items-center p-4 border border-gray-200 rounded-lg opacity-60 cursor-not-allowed">
                  <input type="radio" name="payment" disabled className="mr-3" />
                  <div>
                    <span className="font-medium">Razorpay (UPI / Cards / Netbanking)</span>
                    <p className="text-sm text-neutral-500">Coming soon</p>
                  </div>
                </label>
                <label className="flex items-center p-4 border border-gray-200 rounded-lg opacity-60 cursor-not-allowed">
                  <input type="radio" name="payment" disabled className="mr-3" />
                  <div>
                    <span className="font-medium">Stripe (International Cards)</span>
                    <p className="text-sm text-neutral-500">Coming soon</p>
                  </div>
                </label>
              </div>

              <div className="mb-6">
                <Input
                  label="Coupon Code (optional)"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="e.g. WELCOME10"
                  helperText="Try WELCOME10 for 10% off orders above ₹499"
                />
                {estimatedDiscount > 0 && (
                  <p className="mt-2 text-sm font-medium text-green-700">
                    WELCOME10 applied — you save about {formatCurrency(estimatedDiscount)}
                  </p>
                )}
              </div>

              <div className="mb-6">
                <label className="mb-1" htmlFor="order-notes">
                  Order Notes (optional)
                </label>
                <textarea
                  id="order-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any delivery instructions"
                  className="h-24"
                />
              </div>

              <Button fullWidth variant="primary" size="lg" onClick={() => setCurrentStep('review')}>
                Review Order
              </Button>
            </div>
          )}

          {currentStep === 'review' && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Review Your Order</h2>

              {orderError && <div className="alert alert-error mb-6">{orderError}</div>}

              <div className="bg-gray-50 p-4 rounded mb-6">
                <h3 className="text-base font-semibold mb-3">Items</h3>
                <div className="space-y-2 border-b pb-3 mb-3">
                  {cartItems.map((item) => (
                    <div key={item.id} className="flex justify-between gap-2 text-sm">
                      <span className="line-clamp-1">
                        {item.product.name} x {item.quantity}
                      </span>
                      <span className="flex-shrink-0">
                        {formatCurrency(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  {estimatedDiscount > 0 && (
                    <div className="flex justify-between text-green-700">
                      <span>Coupon ({couponCode.trim().toUpperCase()})</span>
                      <span>-{formatCurrency(estimatedDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Shipping</span>
                    <span>{shipping === 0 ? 'FREE' : formatCurrency(shipping)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 text-base font-bold">
                    <span>Total</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded mb-6 text-sm">
                <h3 className="text-base font-semibold mb-2">Delivery</h3>
                <p className="font-medium">{form.fullName}</p>
                <p>
                  {form.addressLine1}
                  {form.addressLine2 ? `, ${form.addressLine2}` : ''}
                </p>
                <p>
                  {form.city}, {form.state} {form.postalCode}, {form.country}
                </p>
                <p className="mt-1 text-neutral-600">Phone: {form.phoneNumber}</p>
                <p className="mt-2 text-neutral-600">Payment: Cash on Delivery</p>
              </div>

              <Button
                fullWidth
                variant="primary"
                size="lg"
                onClick={placeOrder}
                loading={isPlacing}
              >
                Place Order ({formatCurrency(total)})
              </Button>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
