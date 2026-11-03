'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { CouponField, type AppliedCoupon } from '@/components/cart';
import { AddressPicker, CheckoutSteps } from '@/components/checkout';
import { Card, Button, Input, LoadingSpinner } from '@/components/common';
import { apiClient } from '@/lib/api-client';
import { useHasToken } from '@/hooks/useHasToken';
import { calculateShipping, getApiErrorMessage } from '@/lib/api-utils';
import { orderConfirmationPath } from '@/lib/orders-api';
import { fetchPaymentConfig, payForOrder, type PaymentConfig } from '@/lib/payments';
import { formatCurrency } from '@/utils/helpers';
import { AppDispatch } from '@/store';
import { clearCart } from '@/store/slices/cart';
import { Address } from '@/types';

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

/**
 * The two ways to pay, and the only two the API accepts. Cash on delivery is
 * the default because it is the one that is always available — the online
 * option depends on the gateway being configured, which is checked at load.
 */
type PaymentChoice = 'COD' | 'RAZORPAY';

/** An order that exists but has not been paid for, kept so it can be retried. */
interface UnpaidOrder {
  id: string;
  orderNumber: string | null;
}

const REQUIRED_FIELDS: Array<{ key: keyof ShippingForm; label: string }> = [
  { key: 'fullName', label: 'Full Name' },
  { key: 'phoneNumber', label: 'Phone Number' },
  { key: 'addressLine1', label: 'Address Line 1' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postalCode', label: 'Postal Code' },
  { key: 'country', label: 'Country' },
];

/**
 * Collapse addresses that are the same place.
 *
 * Placing an order writes its own copy of the shipping address, so a regular
 * customer's address book fills up with identical rows and the picker turns
 * into a wall of the same house. The API sorts default first, then newest, so
 * keeping the first of each group keeps the row worth offering.
 */
const dedupe = (addresses: Address[]): Address[] => {
  const seen = new Set<string>();
  return addresses.filter((address) => {
    const key = [
      address.fullName,
      address.phoneNumber,
      address.addressLine1,
      address.addressLine2 ?? '',
      address.city,
      address.state,
      address.postalCode,
      address.country,
    ]
      .map((part) => part.trim().toLowerCase())
      .join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * A saved address, in the shape the shipping form holds. The field names match
 * the address book's on purpose, so one saved at checkout and one saved from
 * `/dashboard/addresses` are the same record.
 */
const toForm = (address: Address): ShippingForm => ({
  fullName: address.fullName,
  phoneNumber: address.phoneNumber,
  email: address.email ?? '',
  addressLine1: address.addressLine1,
  addressLine2: address.addressLine2 ?? '',
  city: address.city,
  state: address.state,
  postalCode: address.postalCode,
  country: address.country,
});

export default function CheckoutPage() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState('shipping');
  // null until the browser takes over — see the hook.
  const hasToken = useHasToken();
  const [cartItems, setCartItems] = useState<CheckoutCartItem[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const [addresses, setAddresses] = useState<Address[]>([]);
  // The id of the saved address being shipped to; `null` means the shopper is
  // typing a new one, which is also the only state a first-time customer sees.
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  // Placing an order already writes the address into the book (the API creates
  // the row), so the only thing left to choose is whether it becomes the one
  // offered first next time. Ticked by default for a first-time customer,
  // whose only address should obviously be their default.
  const [makeDefaultAddress, setMakeDefaultAddress] = useState(true);

  const [form, setForm] = useState<ShippingForm>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ShippingForm, string>>>({});
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [notes, setNotes] = useState('');

  const [isPlacing, setIsPlacing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentChoice>('COD');
  // null while the gateway's availability is still being read. Treated as
  // unavailable until it answers — the online option is never offered on the
  // assumption that it works.
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  /**
   * Set when an order was created but the payment did not complete — the
   * customer closed the Razorpay modal, or the attempt failed. The order is
   * real and unpaid, so the next button pays for *it* rather than placing a
   * second order for the same basket. The cart is already cleared server-side
   * at order creation, so re-placing is not an option anyway.
   */
  const [unpaidOrder, setUnpaidOrder] = useState<UnpaidOrder | null>(null);

  // Nothing is set synchronously here: the effect below only starts the two
  // requests, and every setState lands in a callback once they resolve.
  const load = useCallback(() => {
    const cart = apiClient
      .get('/cart')
      .then((res) => {
        const data = res.data?.data?.cart;
        setCartItems(data?.items ?? []);
        setSubtotal(
          data?.subtotal ??
            (data?.items ?? []).reduce(
              (sum: number, item: CheckoutCartItem) => sum + item.price * item.quantity,
              0
            )
        );
      })
      .catch(() => {
        /* an empty cart view is shown below */
      });

    // The address book, so a returning customer picks rather than retypes. A
    // failure here is not worth a toast: the blank form is still a full path
    // through checkout.
    const savedAddresses = apiClient
      .get('/users/addresses')
      .then((res) => {
        const saved = dedupe((res.data?.data?.addresses ?? []) as Address[]);
        setAddresses(saved);
        if (saved.length > 0) setMakeDefaultAddress(false);
        const preferred = saved.find((address) => address.isDefault) ?? saved[0];
        if (preferred) {
          setSelectedAddressId(preferred.id);
          setForm(toForm(preferred));
        }
      })
      .catch(() => {
        /* checkout falls back to the blank form */
      });

    // Whether online payment can be offered at all. `fetchPaymentConfig` never
    // rejects — it resolves to a disabled config carrying a reason — so an
    // unreachable API leaves checkout working on cash on delivery rather than
    // offering a payment button that cannot work.
    const gateway = fetchPaymentConfig().then(setPaymentConfig);

    return Promise.all([cart, savedAddresses, gateway]).finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (hasToken) void load();
  }, [hasToken, load]);

  // Quoted by the same server-side resolver that order placement uses, so the
  // figure shown here is the one actually charged.
  const discount = coupon?.discount ?? 0;
  const shipping = cartItems.length > 0 ? calculateShipping(subtotal, discount) : 0;
  const total = subtotal - discount + shipping;

  // Stable identity: CouponField re-validates on mount and would otherwise see
  // a new callback on every keystroke elsewhere in the form.
  const handleCouponChange = useCallback((applied: AppliedCoupon | null) => {
    setCoupon(applied);
  }, []);

  const setField = (key: keyof ShippingForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  /**
   * Switching between a saved address and a new one only ever rewrites `form`,
   * so the payload builder below has a single source whichever way the address
   * was supplied.
   */
  const selectAddress = (id: string | null) => {
    setSelectedAddressId(id);
    setFieldErrors({});
    if (id === null) {
      setForm(EMPTY_FORM);
      return;
    }
    const chosen = addresses.find((address) => address.id === id);
    if (chosen) setForm(toForm(chosen));
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
    if (validateShipping()) {
      setCurrentStep('payment');
      return;
    }
    // The messages sit on form fields, so an incomplete saved address has to
    // open the form — otherwise the button would simply stop working with
    // nothing on screen to explain why.
    if (selectedAddressId !== null) setSelectedAddressId(null);
  };

  /**
   * Where a finished order sends the customer. Keyed on the order number so the
   * page survives a reload and can be linked from the confirmation email.
   */
  const goToConfirmation = (orderNumber: string | null) => {
    router.push(orderNumber ? orderConfirmationPath(orderNumber) : '/dashboard?tab=orders');
  };

  /**
   * Open Razorpay for an order that already exists.
   *
   * The four outcomes are deliberately not collapsed. A customer whose money
   * has left their account must never be shown a failure, so both `paid` and
   * `pending` go to the confirmation page — `pending` only means our server has
   * not caught up, and the webhook settles it. Only `dismissed` and `failed`
   * keep them here, with the order held for a retry.
   */
  const runPayment = async (orderId: string, orderNumber: string | null) => {
    const outcome = await payForOrder(orderId);

    if (outcome.status === 'paid') {
      toast.success('Payment successful');
      goToConfirmation(orderNumber);
      return;
    }
    if (outcome.status === 'pending') {
      toast.success(outcome.message);
      goToConfirmation(orderNumber);
      return;
    }

    setUnpaidOrder({ id: orderId, orderNumber });
    const message =
      outcome.status === 'dismissed'
        ? `Payment was not completed. Your order ${orderNumber ?? ''} is saved and unpaid — you can pay for it now.`.replace(
            '  ',
            ' '
          )
        : outcome.message;
    setOrderError(message);
    toast.error(
      outcome.status === 'dismissed' ? 'Payment cancelled' : 'Payment could not be completed'
    );
    setIsPlacing(false);
  };

  /** Pay again for the order the last attempt left unpaid. */
  const retryPayment = async () => {
    if (!unpaidOrder) return;
    setIsPlacing(true);
    setOrderError(null);
    await runPayment(unpaidOrder.id, unpaidOrder.orderNumber);
  };

  const placeOrder = async () => {
    setIsPlacing(true);
    setOrderError(null);
    const shippingAddress = {
      fullName: form.fullName.trim(),
      phoneNumber: form.phoneNumber.trim(),
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      addressLine1: form.addressLine1.trim(),
      ...(form.addressLine2.trim() ? { addressLine2: form.addressLine2.trim() } : {}),
      city: form.city.trim(),
      state: form.state.trim(),
      postalCode: form.postalCode.trim(),
      country: form.country.trim(),
    };
    try {
      const payload: Record<string, unknown> = {
        shippingAddress,
        paymentMethod,
        ...(coupon ? { couponCode: coupon.code } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      const res = await apiClient.post('/orders', payload);
      const order = res.data?.data?.order;
      // The server says whether money is still owed, rather than the page
      // re-deriving it from the payment method — so the two cannot disagree.
      const paymentRequired = Boolean(res.data?.data?.payment?.required);
      dispatch(clearCart());

      // Promote the row the order just created rather than posting a second
      // copy of the same address — the API already saved it, and a duplicate
      // would show up twice in the picker above. A convenience either way, so
      // it happens after the order exists and a failure is swallowed: nothing
      // about a placed order should hinge on it.
      const savedAddressId = order?.shippingAddressId as string | undefined;
      if (selectedAddressId === null && makeDefaultAddress && savedAddressId) {
        try {
          await apiClient.put(`/users/addresses/${savedAddressId}`, {
            type: 'home',
            ...shippingAddress,
            isDefault: true,
          });
        } catch {
          /* the order stands regardless */
        }
      }

      // A prepaid order exists but is not paid for yet, and the gateway is the
      // next step rather than the confirmation page. Nothing about the order
      // is provisional — closing the modal leaves it placed and unpaid, which
      // is why `runPayment` holds on to it for a retry.
      if (paymentRequired && order?.id) {
        await runPayment(order.id, order.orderNumber ?? null);
        return;
      }

      toast.success('Order placed successfully');
      // The confirmation is a real, refreshable page keyed on the order
      // number, so it survives a reload and can be linked from an email.
      goToConfirmation(order?.orderNumber ?? null);
    } catch (err) {
      const message = getApiErrorMessage(err, 'Could not place your order. Please try again.');
      setOrderError(message);
      toast.error(message);
      setIsPlacing(false);
    }
  };

  if (hasToken === null || (hasToken && isLoading)) {
    return <LoadingSpinner className="min-h-[50vh]" size="lg" />;
  }

  if (hasToken === false) {
    return (
      <main className="section-y">
        <div className="container-max max-w-lg text-center">
          <Card className="p-10">
            <h1 className="mb-3 text-3xl">Checkout</h1>
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

  if (cartItems.length === 0) {
    return (
      <main className="section-y">
        <div className="container-max max-w-lg text-center">
          <Card className="p-10">
            <h1 className="mb-3 text-3xl">Checkout</h1>
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
  const isNewAddress = selectedAddressId === null;
  // Unknown counts as unavailable: the option is never offered on an assumption.
  const onlinePaymentEnabled = paymentConfig?.enabled === true;

  return (
    <main className="section-y">
      <div className="container-max max-w-4xl">
        <header className="page-intro page-intro--compact"><p>Secure order</p><h1>Checkout</h1></header>

        <CheckoutSteps
          steps={CHECKOUT_STEPS}
          currentStep={currentStep}
          onStepClick={(stepId) => {
            // Only allow going back to already-completed steps.
            const targetIndex = CHECKOUT_STEPS.findIndex((s) => s.id === stepId);
            if (targetIndex < stepIndex) setCurrentStep(stepId);
          }}
        />

        <Card className="p-5 md:p-8">
          {currentStep === 'shipping' && (
            <div>
              <h2 className="mb-6 text-2xl">Shipping address</h2>

              {addresses.length > 0 && (
                <div className="mb-6">
                  <AddressPicker
                    addresses={addresses}
                    selectedId={selectedAddressId}
                    onSelect={selectAddress}
                  />
                </div>
              )}

              {isNewAddress && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <Input
                      label="Full Name *"
                      value={form.fullName}
                      onChange={(e) => setField('fullName', e.target.value)}
                      error={fieldErrors.fullName}
                      placeholder="Full name"
                      autoComplete="name"
                    />
                    <Input
                      label="Phone Number *"
                      type="tel"
                      value={form.phoneNumber}
                      onChange={(e) => setField('phoneNumber', e.target.value)}
                      error={fieldErrors.phoneNumber}
                      placeholder="10-digit phone number"
                      autoComplete="tel"
                    />
                    <div className="md:col-span-2">
                      <Input
                        label="Email (optional)"
                        type="email"
                        value={form.email}
                        onChange={(e) => setField('email', e.target.value)}
                        error={fieldErrors.email}
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Input
                        label="Address Line 1 *"
                        value={form.addressLine1}
                        onChange={(e) => setField('addressLine1', e.target.value)}
                        error={fieldErrors.addressLine1}
                        placeholder="House / building, street"
                        autoComplete="address-line1"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Input
                        label="Address Line 2 (optional)"
                        value={form.addressLine2}
                        onChange={(e) => setField('addressLine2', e.target.value)}
                        placeholder="Landmark, area"
                        autoComplete="address-line2"
                      />
                    </div>
                    <Input
                      label="City *"
                      value={form.city}
                      onChange={(e) => setField('city', e.target.value)}
                      error={fieldErrors.city}
                      placeholder="City"
                      autoComplete="address-level2"
                    />
                    <Input
                      label="State *"
                      value={form.state}
                      onChange={(e) => setField('state', e.target.value)}
                      error={fieldErrors.state}
                      placeholder="State"
                      autoComplete="address-level1"
                    />
                    <Input
                      label="Postal Code *"
                      value={form.postalCode}
                      onChange={(e) => setField('postalCode', e.target.value)}
                      error={fieldErrors.postalCode}
                      placeholder="PIN code"
                      autoComplete="postal-code"
                    />
                    <Input
                      label="Country *"
                      value={form.country}
                      onChange={(e) => setField('country', e.target.value)}
                      error={fieldErrors.country}
                      placeholder="Country"
                      autoComplete="country-name"
                    />
                  </div>

                  <div className="mb-6">
                    <label className="flex cursor-pointer items-center gap-2 text-[14px] text-ink">
                      <input
                        type="checkbox"
                        className="flex-shrink-0"
                        checked={makeDefaultAddress}
                        onChange={(e) => setMakeDefaultAddress(e.target.checked)}
                      />
                      Make this my default delivery address
                    </label>
                    <p className="m-0 mt-1 text-[13px]" style={{ color: 'var(--ink-3)' }}>
                      Every address you order to is kept in your address book, so you can pick it
                      next time either way.
                    </p>
                  </div>
                </>
              )}

              <Button fullWidth variant="primary" size="lg" onClick={goToPayment}>
                Continue to Payment
              </Button>
            </div>
          )}

          {currentStep === 'payment' && (
            <div>
              <h2 className="mb-6 text-2xl">Payment method</h2>
              <div className="space-y-4 mb-6">
                <label
                  className={`flex cursor-pointer items-center border p-4 ${
                    paymentMethod === 'COD' ? 'border-ink bg-surface-2' : 'border-line'
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    className="mr-3 rounded-full"
                    checked={paymentMethod === 'COD'}
                    onChange={() => setPaymentMethod('COD')}
                  />
                  <div>
                    <span>Cash on Delivery (COD)</span>
                    <p className="text-sm text-neutral-600">Pay in cash when your order arrives.</p>
                  </div>
                </label>

                {/*
                  The online option is only offered when the server says the
                  gateway is actually configured, and when it is not it carries
                  the server's own reason. A button that opens a payment sheet
                  and then fails is worse than one that was never offered: the
                  customer has already decided to pay by then.
                */}
                <label
                  className={`flex items-center border p-4 ${
                    onlinePaymentEnabled
                      ? `cursor-pointer ${
                          paymentMethod === 'RAZORPAY' ? 'border-ink bg-surface-2' : 'border-line'
                        }`
                      : 'cursor-not-allowed border-line opacity-60'
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    className="mr-3 rounded-full"
                    disabled={!onlinePaymentEnabled}
                    checked={paymentMethod === 'RAZORPAY'}
                    onChange={() => setPaymentMethod('RAZORPAY')}
                  />
                  <div>
                    <span>Pay online (UPI / Cards / Netbanking / Wallets)</span>
                    <p
                      className={`text-sm ${
                        onlinePaymentEnabled ? 'text-neutral-600' : 'text-neutral-500'
                      }`}
                    >
                      {onlinePaymentEnabled
                        ? 'Secure payment through Razorpay. You will be asked to pay after placing the order.'
                        : (paymentConfig?.reason ??
                          'Checking whether online payment is available…')}
                    </p>
                  </div>
                </label>
              </div>

              <div className="mb-6">
                <CouponField subtotal={subtotal} onChange={handleCouponChange} />
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
              <h2 className="mb-6 text-2xl">Review your order</h2>

              {orderError && <div className="alert alert-error mb-6">{orderError}</div>}

              <div className="border border-line p-4 rounded-control mb-6">
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
                  {coupon && (
                    <div className="flex justify-between text-green-700">
                      <span>Coupon ({coupon.code})</span>
                      <span>-{formatCurrency(coupon.discount)}</span>
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

              <div className="border border-line p-4 rounded-control mb-6 text-sm">
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
                <p className="mt-2 text-neutral-600">
                  Payment:{' '}
                  {paymentMethod === 'COD'
                    ? 'Cash on Delivery'
                    : 'Online (UPI / Cards / Netbanking / Wallets)'}
                </p>
              </div>

              {/*
                Once an order exists and is unpaid, the button pays for that
                order rather than placing another. The cart was cleared when the
                order was created, so a second placement would fail on an empty
                basket — and if it did not, it would double the customer's order.
              */}
              <Button
                fullWidth
                variant="primary"
                size="lg"
                onClick={unpaidOrder ? retryPayment : placeOrder}
                loading={isPlacing}
              >
                {unpaidOrder
                  ? `Pay Now (${formatCurrency(total)})`
                  : paymentMethod === 'RAZORPAY'
                    ? `Place Order & Pay (${formatCurrency(total)})`
                    : `Place Order (${formatCurrency(total)})`}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
