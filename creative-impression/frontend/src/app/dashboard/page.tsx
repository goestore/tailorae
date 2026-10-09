'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { DashboardMenu, ReturnRequestModal } from '@/components/dashboard';
import { Card, Button, Input, LoadingSpinner } from '@/components/common';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { formatCurrency } from '@/utils/helpers';
import { AppDispatch, RootState } from '@/store';
import { logout, updateUser } from '@/store/slices/auth';
import { clearCart } from '@/store/slices/cart';
import { Order, User } from '@/types';

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  READY_FOR_SHIPMENT: 'bg-indigo-100 text-indigo-800',
  SHIPPED: 'bg-primary-100 text-primary-800',
  DELIVERED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
  RETURNED: 'bg-neutral-200 text-neutral-700',
};

const prettyStatus = (status: string) =>
  status
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useDispatch<AppDispatch>();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);

  const initialTab = searchParams.get('tab') || 'overview';
  const [activeSection, setActiveSection] = useState(initialTab);

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Redirect to login once session-restore has resolved with no user.
  useEffect(() => {
    if (isInitialized && !user) {
      router.replace('/auth/login?redirect=/dashboard');
    }
  }, [isInitialized, user, router]);

  // Nothing is set synchronously here: the effect below only starts the fetch,
  // and every setState lands in a callback once it resolves.
  const loadOrders = useCallback(
    () =>
      apiClient
        .get('/orders')
        .then((res) => setOrders(res.data?.data?.orders ?? []))
        .catch((err) => toast.error(getApiErrorMessage(err, 'Could not load your orders.')))
        .finally(() => {
          setOrdersLoading(false);
          setOrdersLoaded(true);
        }),
    []
  );

  useEffect(() => {
    if (user && activeSection === 'orders' && !ordersLoaded) {
      void loadOrders();
    }
  }, [user, activeSection, ordersLoaded, loadOrders]);

  const handleLogout = useCallback(() => {
    apiClient.post('/auth/logout').catch(() => {});
    localStorage.removeItem('token');
    dispatch(logout());
    dispatch(clearCart());
    router.push('/');
  }, [dispatch, router]);

  const handleSectionChange = (section: string) => {
    if (section === 'logout') {
      handleLogout();
      return;
    }
    setActiveSection(section);
  };

  const cancelOrder = async (orderId: string) => {
    setCancellingId(orderId);
    try {
      const res = await apiClient.patch(`/orders/${orderId}/cancel`);
      const updated = res.data?.data?.order as Order | undefined;
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: updated?.status ?? 'CANCELLED' } : o))
      );
      toast.success('Order cancelled');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not cancel this order.'));
    } finally {
      setCancellingId(null);
    }
  };

  // Still restoring the session, or about to redirect.
  if (!isInitialized || !user) {
    return <LoadingSpinner className="min-h-[50vh]" size="lg" />;
  }

  return (
    <main className="section-y">
      <div className="container-max">
        <header className="page-intro page-intro--compact"><p>Account</p><h1>My account</h1></header>

        {!user.emailVerified && <VerifyEmailBanner />}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          <div className="md:col-span-1">
            <DashboardMenu activeSection={activeSection} onSectionChange={handleSectionChange} />
          </div>

          <div className="md:col-span-3">
            {activeSection === 'overview' && (
              <OverviewPanel
                user={user}
                orderCount={ordersLoaded ? orders.length : null}
                onLoadOrders={() => {
                  if (!ordersLoaded) loadOrders();
                }}
              />
            )}

            {activeSection === 'orders' && (
              <OrdersPanel
                orders={orders}
                loading={ordersLoading}
                loaded={ordersLoaded}
                cancellingId={cancellingId}
                onCancel={cancelOrder}
                onReload={loadOrders}
              />
            )}

            {activeSection === 'profile' && <ProfilePanel user={user} />}

            {activeSection === 'settings' && <SettingsPanel user={user} />}
          </div>
        </div>
      </div>
    </main>
  );
}

function OverviewPanel({
  user,
  orderCount,
  onLoadOrders,
}: {
  user: User;
  orderCount: number | null;
  onLoadOrders: () => void;
}) {
  useEffect(() => {
    if (orderCount === null) onLoadOrders();
  }, [orderCount, onLoadOrders]);

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h2 className="text-2xl font-bold mb-1">
          Welcome back, {user.firstName || user.email}
        </h2>
        <p className="text-neutral-500">Here&apos;s a quick look at your account.</p>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-neutral-500 text-sm font-semibold mb-2">Total Orders</h3>
          <p className="text-3xl font-bold">{orderCount ?? '—'}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-neutral-500 text-sm font-semibold mb-2">Account Type</h3>
          <p className="text-3xl font-bold capitalize">
            {user.role.replace('_', ' ').toLowerCase()}
          </p>
        </Card>
      </div>
    </div>
  );
}

function OrdersPanel({
  orders,
  loading,
  loaded,
  cancellingId,
  onCancel,
  onReload,
}: {
  orders: Order[];
  loading: boolean;
  loaded: boolean;
  cancellingId: string | null;
  onCancel: (id: string) => void;
  onReload: () => void;
}) {
  if (loading && !loaded) {
    return <LoadingSpinner className="min-h-[30vh]" size="lg" />;
  }

  if (loaded && orders.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-neutral-600 text-lg mb-6">You haven&apos;t placed any orders yet.</p>
        <Link href="/products">
          <Button variant="primary" size="lg">
            Start Shopping
          </Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => {
        const itemCount = order.items?.reduce((sum, i) => sum + i.quantity, 0) ?? 0;
        const canCancel = order.status === 'PENDING' || order.status === 'CONFIRMED';
        // The API accepts a return on delivered orders only, and one per
        // order — mirrored here so the button is not offered into a 409.
        const canReturn = order.status === 'DELIVERED' && !order.returnRequest;
        return (
          <Card key={order.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-semibold">Order #{order.orderNumber}</p>
                <p className="text-sm text-neutral-500">
                  {new Date(order.createdAt).toLocaleDateString()} • {itemCount} item
                  {itemCount === 1 ? '' : 's'}
                </p>
                {order.items?.length > 0 && (
                  <p className="mt-1 text-sm text-neutral-600 line-clamp-1">
                    {order.items.map((i) => i.product?.name).filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-neutral-900">{formatCurrency(order.total)}</p>
                <span
                  className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium ${
                    STATUS_STYLES[order.status] ?? 'bg-neutral-100 text-neutral-700'
                  }`}
                >
                  {prettyStatus(order.status)}
                </span>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-neutral-100 pt-3">
              {order.returnRequest && (
                <span className="mr-auto text-sm text-neutral-500">
                  Return {order.returnRequest.status.toLowerCase()}
                </span>
              )}
              <Link
                href={`/track-order?order=${encodeURIComponent(order.orderNumber)}`}
                className="text-sm underline underline-offset-2 text-neutral-500 hover:text-ink"
              >
                Track
              </Link>
              <Link
                href={`/invoice/${order.id}`}
                className="text-sm underline underline-offset-2 text-neutral-500 hover:text-ink"
              >
                Invoice
              </Link>
              {canReturn && <ReturnRequestModal order={order} onRequested={onReload} />}
              {canCancel && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  loading={cancellingId === order.id}
                  onClick={() => onCancel(order.id)}
                >
                  Cancel Order
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/**
 * Unconfirmed accounts get one line and a resend button. The address comes
 * from the session on the server, so this cannot be pointed at anyone else.
 */
function VerifyEmailBanner() {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const resend = async () => {
    setState('sending');
    try {
      const res = await apiClient.post('/auth/resend-verification');
      toast.success(res.data?.message ?? 'Confirmation link sent.');
      setState('sent');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not send the confirmation email.'));
      setState('idle');
    }
  };
  return (
    <div
      className="mb-5 flex flex-wrap items-center justify-between gap-3 border px-4 py-3 text-[14px]"
      style={{ borderColor: 'var(--brand)', background: 'var(--brand-soft)' }}
    >
      <p className="m-0" style={{ color: 'var(--ink-2)' }}>
        <strong className="text-ink">Confirm your email address.</strong> We sent a link when you
        signed up.
      </p>
      <button
        type="button"
        onClick={resend}
        disabled={state !== 'idle'}
        className="btn btn-primary btn-sm"
      >
        {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Link sent' : 'Resend link'}
      </button>
    </div>
  );
}

function ProfilePanel({ user }: { user: User }) {
  const dispatch = useDispatch<AppDispatch>();
  const [firstName, setFirstName] = useState(user.firstName ?? '');
  const [lastName, setLastName] = useState(user.lastName ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiClient.put('/users/profile', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        // null clears a saved number; undefined would leave it untouched.
        phone: phone.trim() || null,
      });
      const updated = res.data?.data?.user as User | undefined;
      if (updated) dispatch(updateUser(updated));
      toast.success('Profile updated');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not update your profile.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4">
      <h2 className="text-2xl font-bold mb-6">Profile Information</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        <Input label="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        <div className="md:col-span-2">
          <Input
            label="Email"
            value={user.email}
            readOnly
            disabled
            helperText="Email cannot be changed."
          />
        </div>
        <div className="md:col-span-2">
          <Input
            label="Phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Add a phone number"
          />
        </div>
      </div>
      <div className="mt-6">
        <Button variant="primary" onClick={save} loading={saving}>
          Save Changes
        </Button>
      </div>
    </Card>
  );
}

function SettingsPanel({ user }: { user: User }) {
  const dispatch = useDispatch<AppDispatch>();
  const [subscribe, setSubscribe] = useState(Boolean(user.subscribeToNewsletter));
  const [saving, setSaving] = useState(false);

  const toggle = async (next: boolean) => {
    setSubscribe(next);
    setSaving(true);
    try {
      const res = await apiClient.put('/users/profile', { subscribeToNewsletter: next });
      const updated = res.data?.data?.user as User | undefined;
      if (updated) dispatch(updateUser(updated));
      toast.success('Preferences saved');
    } catch (err) {
      setSubscribe(!next); // revert on failure
      toast.error(getApiErrorMessage(err, 'Could not save your preferences.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4">
      <h2 className="text-2xl font-bold mb-6">Account Settings</h2>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={subscribe}
          disabled={saving}
          onChange={(e) => toggle(e.target.checked)}
          className="h-4 w-4"
        />
        <span>Receive promotional emails and offers</span>
      </label>
    </Card>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingSpinner className="min-h-[50vh]" size="lg" />}>
      <DashboardContent />
    </Suspense>
  );
}
