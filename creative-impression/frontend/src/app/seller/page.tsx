'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Breadcrumbs, Button, Input, LoadingSpinner } from '@/components/common';
import {
  applyToSell,
  getApplicationsOpen,
  getSellerSummary,
  PENDING_SHOP_KEY,
  type CompanyDetails,
  type LowStockItem,
  type MyShop,
  type SellerApplicationStatus,
  type SellerOrderSummary,
  type SellerStats,
} from '@/lib/seller-api';
import { formatCurrency } from '@/utils/helpers';
import { RootState } from '@/store';
import {
  CompanyFields,
  EMPTY_COMPANY,
  companyPayload,
  companyProblem,
} from './_components/CompanyFields';
import { TextArea } from './_components/fields';

const Stat: React.FC<{ label: string; value: string; note?: string }> = ({
  label,
  value,
  note,
}) => (
  <div className="border border-line p-4">
    <p
      className="m-0 text-[10.5px] font-bold uppercase tracking-[0.12em]"
      style={{ color: 'var(--ink-3)' }}
    >
      {label}
    </p>
    <p className="m-0 mt-2 text-[26px] font-semibold leading-none text-ink">{value}</p>
    {note && (
      <p className="m-0 mt-1.5 text-[12px]" style={{ color: 'var(--ink-3)' }}>
        {note}
      </p>
    )}
  </div>
);

/**
 * What stands between a new shop and its first sale, in order.
 *
 * Approval used to be a single "awaiting approval" message with nothing for
 * the seller to do. Now the identity check is the seller's own step, so the
 * banner says which step they are on and links straight to it.
 */
const VerificationBanner: React.FC<{ shop: MyShop }> = ({ shop }) => {
  const copy: Record<MyShop['kycStatus'], { title: string; body: string; cta?: string }> = {
    NOT_SUBMITTED: {
      title: 'Verify your business to start selling',
      body: 'Add your PAN (and GSTIN if you have one) with a supporting document. It takes about two minutes. You can keep adding products in the meantime.',
      cta: 'Start verification',
    },
    PENDING: {
      title: 'Your verification is being reviewed',
      body: 'We usually finish within one working day. Your listings go live as soon as you are approved.',
    },
    REJECTED: {
      title: 'We could not verify your business',
      body: shop.kycRejectionReason
        ? `Reason: ${shop.kycRejectionReason}`
        : 'Please check your details and submit again.',
      cta: 'Fix and resubmit',
    },
    APPROVED: {
      title: 'Your shop is awaiting final approval',
      body: 'Your identity is verified. An admin will switch your shop on shortly.',
    },
  };
  const step = copy[shop.kycStatus] ?? copy.NOT_SUBMITTED;

  return (
    <div
      className="mt-6 flex flex-wrap items-center justify-between gap-4 border px-4 py-3.5 text-[14px]"
      style={{ borderColor: 'var(--brand)', background: 'var(--brand-soft)' }}
    >
      <div className="min-w-0 flex-1">
        <p className="m-0 font-semibold text-ink">{step.title}</p>
        <p className="m-0 mt-1" style={{ color: 'var(--ink-2)' }}>
          {step.body}
        </p>
      </div>
      {step.cta && (
        <Link href="/seller/verification" className="btn btn-primary btn-sm">
          {step.cta}
        </Link>
      )}
    </div>
  );
};

/**
 * Where the owner's decision on the application stands.
 *
 * The shop exists from the moment someone applies, but listing stays closed
 * until it is APPROVED. Each state says what happens next, and a rejection or
 * suspension shows the admin's note so the seller knows what to fix.
 */
const ApplicationBanner: React.FC<{ shop: MyShop }> = ({ shop }) => {
  const copy: Partial<
    Record<SellerApplicationStatus, { title: string; body: string; tone: 'brand' | 'alert' }>
  > = {
    APPLIED: {
      title: 'Application received',
      body: 'We review every new seller before they can list. While you wait, add your bank details, verify your identity and register any brand you sell under — approval is quicker when they are done.',
      tone: 'brand',
    },
    UNDER_REVIEW: {
      title: 'Your application is being reviewed',
      body: 'We are checking your business details. You will be able to list products as soon as it is approved.',
      tone: 'brand',
    },
    REJECTED: {
      title: 'Your application was not approved',
      body: shop.applicationNote
        ? `Note from our team: ${shop.applicationNote}. Update your business details in Shop settings, then contact us to be reconsidered.`
        : 'Update your business details in Shop settings, then contact us to be reconsidered.',
      tone: 'alert',
    },
    SUSPENDED: {
      title: 'Your shop is suspended',
      body: shop.applicationNote
        ? `Note from our team: ${shop.applicationNote}. Your listings are hidden from shoppers until it is reinstated.`
        : 'Your listings are hidden from shoppers until it is reinstated. Contact us to resolve it.',
      tone: 'alert',
    },
  };
  const step = copy[shop.applicationStatus];
  if (!step) return null;

  return (
    <div
      className="mt-6 border px-4 py-3.5 text-[14px]"
      style={
        step.tone === 'alert'
          ? { borderColor: 'var(--sale)', background: 'var(--surface-2)' }
          : { borderColor: 'var(--brand)', background: 'var(--brand-soft)' }
      }
    >
      <p className="m-0 font-semibold text-ink">{step.title}</p>
      <p className="m-0 mt-1" style={{ color: 'var(--ink-2)' }}>
        {step.body}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {step.tone === 'brand' ? (
          <>
            {!shop.hasBankDetails && (
              <Link href="/seller/settings" className="btn btn-primary btn-sm">
                Add bank details
              </Link>
            )}
            {shop.kycStatus !== 'APPROVED' && shop.kycStatus !== 'PENDING' && (
              <Link href="/seller/verification" className="btn btn-outline btn-sm">
                Verify identity
              </Link>
            )}
            <Link href="/seller/brands" className="btn btn-outline btn-sm">
              Register a brand
            </Link>
          </>
        ) : (
          <>
            <Link href="/seller/settings" className="btn btn-outline btn-sm">
              Business details
            </Link>
            <Link href="/info/contact" className="btn btn-outline btn-sm">
              Contact us
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

const APPLY_STEPS = ['Business', 'Shop'] as const;

/**
 * The form someone fills in to become a seller, in two steps: the business
 * behind the shop (what the owner approves), then the shop itself (what
 * shoppers see). Bank details, identity documents and brand proof come after,
 * from the dashboard — the shop has to exist before private documents can be
 * filed against it.
 */
const ApplyForm: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  // Prefilled from the /sell landing page, which stashes the name before
  // sign-in. This form only mounts client-side, after auth has loaded.
  const [shopName, setShopName] = useState(() => {
    try {
      return sessionStorage.getItem(PENDING_SHOP_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [shopDescription, setShopDescription] = useState('');
  const [company, setCompany] = useState<CompanyDetails>(EMPTY_COMPANY);
  const [step, setStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  // null while checking; the owner may have closed public applications.
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void getApplicationsOpen().then((value) => {
      if (alive) setOpen(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  const next = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = companyProblem(company);
    if (problem) {
      toast.error(problem);
      return;
    }
    setStep(1);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!shopName.trim()) {
      toast.error('Give your shop a name.');
      return;
    }
    setIsSaving(true);
    try {
      await applyToSell({
        shopName: shopName.trim(),
        shopDescription: shopDescription.trim() || undefined,
        ...companyPayload(company),
      });
      try {
        sessionStorage.removeItem(PENDING_SHOP_KEY);
      } catch {
        /* storage blocked */
      }
      toast.success('Application sent.');
      onDone();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  if (open === null) return <LoadingSpinner className="min-h-[30vh]" />;

  if (!open) {
    return (
      <div className="mx-auto mt-10" style={{ maxWidth: '620px' }}>
        <div className="border border-line bg-surface-2 p-6 md:p-8">
          <h2 className="m-0 text-ink" style={{ fontSize: '20px', letterSpacing: '-0.02em' }}>
            Seller registration is by invitation
          </h2>
          <p className="mt-2 text-[15px]" style={{ color: 'var(--ink-2)', lineHeight: 1.65 }}>
            We are not taking open applications right now. If you would like to sell on Creative
            Impression, tell us about your business and we will be in touch.
          </p>
          <Link href="/info/contact" className="btn btn-primary mt-4">
            Contact us
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-10" style={{ maxWidth: '620px' }}>
      <div className="border border-line bg-surface-2 p-6 md:p-8">
        <h2 className="m-0 text-ink" style={{ fontSize: '20px', letterSpacing: '-0.02em' }}>
          Sell on Creative Impression
        </h2>
        <p className="mt-2 text-[15px]" style={{ color: 'var(--ink-2)', lineHeight: 1.65 }}>
          List your own products alongside ours. You keep control of your catalogue, your stock and
          your dispatch; we handle the storefront, checkout and payment.
        </p>

        <ol className="m-0 mt-6 flex list-none gap-2 p-0 text-[12.5px] font-semibold">
          {APPLY_STEPS.map((label, index) => (
            <li
              key={label}
              className="flex-1 border-t-2 pt-2"
              style={{
                borderColor: index <= step ? 'var(--brand)' : 'var(--border)',
                color: index === step ? 'var(--ink)' : 'var(--ink-3)',
              }}
              aria-current={index === step ? 'step' : undefined}
            >
              {index + 1}. {label}
            </li>
          ))}
          <li
            className="flex-1 border-t-2 pt-2"
            style={{ borderColor: 'var(--border)', color: 'var(--ink-3)' }}
          >
            3. Bank &amp; KYC
          </li>
        </ol>

        {step === 0 ? (
          <form onSubmit={next} className="mt-6 flex flex-col gap-4">
            <CompanyFields value={company} onChange={setCompany} />
            <Button type="submit" size="lg">
              Continue
            </Button>
          </form>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <Input
              label="Shop name *"
              value={shopName}
              onChange={(event) => setShopName(event.target.value)}
              placeholder="The name shoppers will see"
              helperText="This becomes your shop page address, so pick the name you trade under."
            />
            <TextArea
              id="shop-description"
              label="What do you sell?"
              rows={4}
              maxLength={2000}
              value={shopDescription}
              onChange={(event) => setShopDescription(event.target.value)}
              placeholder="A line or two about your range — this shows on your shop page."
            />

            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" size="lg" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button type="submit" size="lg" loading={isSaving} className="flex-1">
                Send application
              </Button>
            </div>

            <p className="m-0 text-[13px]" style={{ color: 'var(--ink-3)' }}>
              Next you add bank details, verify your identity and register your brand. You can list
              products once we have approved your application.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

/**
 * A seller's own dashboard.
 *
 * Two states in one page: someone without a shop gets the application form,
 * someone with one gets their figures. Every number is read back from their
 * own sub-orders, which carry the commission and payout recorded at order time
 * — nothing is recalculated here, so what a seller sees is what was settled on.
 */
export default function SellerDashboardPage() {
  const router = useRouter();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);

  const [shop, setShop] = useState<MyShop | null>(null);
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [recent, setRecent] = useState<SellerOrderSummary[]>([]);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.replace('/auth/login?redirect=/seller');
  }, [isInitialized, user, router]);

  // Nothing is set synchronously here: the effect below only starts the fetch,
  // and every setState lands in a callback once it resolves.
  const load = useCallback(
    () =>
      getSellerSummary()
        .then((data) => {
          setShop(data?.shop ?? null);
          setStats(data?.stats ?? null);
          setRecent(data?.recentOrders ?? []);
          setLowStock(data?.lowStock ?? []);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (!isInitialized || (user && isLoading)) {
    return <LoadingSpinner className="min-h-[50vh]" size="lg" />;
  }
  if (!user) return null;

  return (
    <main className="section-y">
      <div className="container-max">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'My Account', href: '/dashboard' },
            { label: 'Sell' },
          ]}
        />

        <header className="mt-6 border-b border-line pb-6">
          <h1
            className="m-0 text-ink"
            style={{
              fontSize: 'clamp(26px, 3.6vw, 38px)',
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
            }}
          >
            {shop ? shop.shopName : 'Become a seller'}
          </h1>
          {shop && (
            <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              {shop.isVerified ? (
                <>
                  Approved ·{' '}
                  <Link
                    href={`/sellers/${shop.shopSlug}`}
                    className="underline underline-offset-2 hover:text-ink"
                  >
                    view your shop page
                  </Link>
                </>
              ) : (
                'Awaiting approval — your listings are not visible to shoppers yet.'
              )}
              {' · '}
              {shop.commissionRate}% commission
            </p>
          )}
        </header>

        {error && <p className="alert alert-error mt-6 text-sm">{error}</p>}

        {!shop ? (
          <ApplyForm onDone={load} />
        ) : (
          <>
            <ApplicationBanner shop={shop} />
            {!shop.isVerified &&
              shop.applicationStatus !== 'REJECTED' &&
              shop.applicationStatus !== 'SUSPENDED' && <VerificationBanner shop={shop} />}

            {/*
              The one thing a seller cannot discover for themselves. Everything
              downstream of a payout — the request button on the earnings page,
              the settle button in the admin console — is disabled until an
              account is on file, and none of those screens can say so here.
            */}
            {!shop.hasBankDetails && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-line bg-surface-2 px-4 py-3.5 text-[14px]">
                <div>
                  <p className="m-0 font-semibold text-ink">We cannot pay you yet</p>
                  <p className="m-0 mt-1" style={{ color: 'var(--ink-2)' }}>
                    Your earnings are counted and held either way — they just cannot be released
                    until we know which account to send them to.
                  </p>
                </div>
                <Link href="/seller/settings" className="btn btn-primary btn-sm">
                  Add bank details
                </Link>
              </div>
            )}

            {stats && (
              <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat
                  label="Ready to pay"
                  value={formatCurrency(stats.payoutDue)}
                  note={
                    stats.ordersDue > 0
                      ? `${stats.ordersDue} order${stats.ordersDue === 1 ? '' : 's'} past the return window`
                      : 'Nothing has cleared yet'
                  }
                />
                <Stat
                  label="Held"
                  value={formatCurrency(stats.payoutHeld)}
                  note={
                    stats.ordersHeld > 0
                      ? `${stats.ordersHeld} order${stats.ordersHeld === 1 ? '' : 's'} in transit or returnable`
                      : 'Nothing in the pipeline'
                  }
                />
                <Stat
                  label="Paid out"
                  value={formatCurrency(stats.payoutSettled)}
                  note="Settled to date"
                />
                <Stat
                  label="Commission"
                  value={formatCurrency(stats.commissionCharged)}
                  note={`${shop.commissionRate}% of sales`}
                />
                <Stat
                  label="Gross sales"
                  value={formatCurrency(stats.grossSales)}
                  note="What buyers paid"
                />
                <Stat label="Orders" value={String(stats.orders)} note="All time" />
                <Stat label="To fulfil" value={String(stats.openOrders)} note="Not yet shipped" />
                <Stat
                  label="Products"
                  value={String(stats.products)}
                  note={
                    stats.awaitingReview > 0
                      ? `${stats.liveProducts} live · ${stats.awaitingReview} in review`
                      : `${stats.liveProducts} live`
                  }
                />
                <Stat
                  label="Rating"
                  value={shop.ratingCount > 0 ? shop.rating.toFixed(1) : '—'}
                  note={shop.ratingCount > 0 ? `${shop.ratingCount} ratings` : 'No ratings yet'}
                />
              </div>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/seller/orders" className="btn btn-primary">
                Manage orders
              </Link>
              <Link href="/seller/products" className="btn btn-outline">
                My products
              </Link>
              <Link href="/seller/earnings" className="btn btn-outline">
                Earnings &amp; payouts
              </Link>
              <Link href="/seller/products/new" className="btn btn-outline">
                List a product
              </Link>
              <Link href="/seller/settings" className="btn btn-outline">
                Shop settings
              </Link>
              <Link href="/seller/verification" className="btn btn-outline">
                Verification
              </Link>
              <Link href="/seller/brands" className="btn btn-outline">
                Brands
              </Link>
            </div>

            {stats && stats.rejected > 0 && (
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border border-line bg-surface-2 px-4 py-3.5 text-[14px]">
                <p className="m-0" style={{ color: 'var(--ink-2)' }}>
                  <strong className="text-ink">
                    {stats.rejected} listing{stats.rejected === 1 ? ' needs' : 's need'} changes
                  </strong>{' '}
                  before {stats.rejected === 1 ? 'it' : 'they'} can go live.
                </p>
                <Link href="/seller/products" className="btn btn-outline btn-sm">
                  See what to fix
                </Link>
              </div>
            )}

            {lowStock.length > 0 && (
              <section className="mt-10">
                <h2
                  className="m-0 text-ink"
                  style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}
                >
                  Running low
                </h2>
                <p className="m-0 mt-1 text-[13px]" style={{ color: 'var(--ink-3)' }}>
                  {shop.lowStockThreshold} or fewer left. Restock before these sell out.
                </p>
                <ul
                  className="m-0 mt-4 flex list-none flex-col gap-px p-0"
                  style={{ background: 'var(--border)' }}
                >
                  {lowStock.map((item) => (
                    <li
                      key={item.variantId ?? item.productId}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3.5"
                      style={{ background: 'var(--surface)' }}
                    >
                      <Link
                        href={`/seller/products/${item.productId}`}
                        className="min-w-0 truncate text-[14px] text-ink hover:underline"
                      >
                        {item.name}
                      </Link>
                      <span className="font-mono text-[12px]" style={{ color: 'var(--ink-3)' }}>
                        {item.sku}
                      </span>
                      <span
                        className="text-[13px] font-semibold"
                        style={{ color: item.quantity === 0 ? 'var(--sale)' : 'var(--ink)' }}
                      >
                        {item.quantity === 0 ? 'Sold out' : `${item.quantity} left`}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-10">
              <h2
                className="m-0 text-ink"
                style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}
              >
                Recent orders
              </h2>
              {recent.length === 0 ? (
                <p className="mt-3 text-[14px]" style={{ color: 'var(--ink-3)' }}>
                  Nothing yet. Orders appear here as soon as someone buys from you.
                </p>
              ) : (
                <ul
                  className="m-0 mt-4 flex list-none flex-col gap-px p-0"
                  style={{ background: 'var(--border)' }}
                >
                  {recent.map((order) => (
                    <li
                      key={order.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3.5"
                      style={{ background: 'var(--surface)' }}
                    >
                      <span className="font-mono text-[13px] text-ink">{order.orderNumber}</span>
                      <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                        {order.status.replace(/_/g, ' ').toLowerCase()}
                      </span>
                      <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
                        {formatCurrency(order.total)} paid
                      </span>
                      <span className="text-[13px] font-semibold text-ink">
                        {formatCurrency(order.payoutAmount)} to you
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
