'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Breadcrumbs, Button, Input, LoadingSpinner } from '@/components/common';
import {
  getMyB2BProfile,
  getMyBulkOrders,
  getMyRfqs,
  respondToQuote,
  saveMyB2BProfile,
  type B2BProfile,
  type BulkOrder,
  type Rfq,
  type RfqStatus,
} from '@/lib/b2b-api';
import { RootState } from '@/store';
import { formatCurrency, formatDate } from '@/utils/helpers';

/**
 * A business buyer's own area: company profile, quote requests with the
 * replies our team sent, and the bulk orders accepted quotes turned into.
 *
 * The profile is self-service but starts unverified; wholesale pricing
 * unlocks only once an admin verifies it.
 */

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const BUSINESS_TYPES = [
  'Corporate',
  'Retailer',
  'Reseller / Distributor',
  'School / Institution',
  'Event / Agency',
  'Non-profit',
  'Other',
];

interface ProfileFormValues {
  companyName: string;
  businessType: string;
  gstNumber: string;
  panNumber: string;
  companyRegistration: string;
  businessCategory: string;
  website: string;
  employeeCount: string;
  monthlyBudget: string;
  businessDescription: string;
}

const EMPTY_VALUES: ProfileFormValues = {
  companyName: '',
  businessType: 'Corporate',
  gstNumber: '',
  panNumber: '',
  companyRegistration: '',
  businessCategory: '',
  website: '',
  employeeCount: '',
  monthlyBudget: '',
  businessDescription: '',
};

const valuesFrom = (p: B2BProfile): ProfileFormValues => ({
  companyName: p.companyName,
  businessType: p.businessType === 'Unspecified' ? 'Corporate' : p.businessType,
  gstNumber: p.gstNumber ?? '',
  panNumber: p.panNumber ?? '',
  companyRegistration: p.companyRegistration ?? '',
  businessCategory: p.businessCategory ?? '',
  website: p.website ?? '',
  employeeCount: p.employeeCount === null ? '' : String(p.employeeCount),
  monthlyBudget: p.monthlyBudget === null ? '' : String(p.monthlyBudget),
  businessDescription: p.businessDescription ?? '',
});

const STATUS_LABEL: Record<RfqStatus, string> = {
  PENDING: 'Awaiting quote',
  QUOTED: 'Quote ready',
  ACCEPTED: 'Accepted',
  REJECTED: 'Declined',
  EXPIRED: 'Expired',
};

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  QUOTED: { background: 'var(--brand-soft)', borderColor: 'var(--brand)', color: 'var(--ink)' },
  ACCEPTED: { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)' },
};

const StatusTag: React.FC<{ status: string; label?: string }> = ({ status, label }) => (
  <span
    className="inline-flex items-center border px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wide"
    style={STATUS_STYLE[status] ?? { borderColor: 'var(--border)', color: 'var(--ink-3)' }}
  >
    {label ?? status.toLowerCase()}
  </span>
);

const SectionTitle: React.FC<{ children: React.ReactNode; sub?: React.ReactNode }> = ({
  children,
  sub,
}) => (
  <div>
    <h2 className="m-0 text-ink" style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}>
      {children}
    </h2>
    {sub && (
      <p className="m-0 mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
        {sub}
      </p>
    )}
  </div>
);

const RfqRow: React.FC<{
  rfq: Rfq;
  busy: boolean;
  onRespond: (rfq: Rfq, decision: 'accept' | 'reject') => void;
}> = ({ rfq, busy, onRespond }) => {
  const canRespond = rfq.status === 'QUOTED';
  return (
    <li className="border border-line p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 font-semibold text-ink" style={{ overflowWrap: 'anywhere' }}>
            {rfq.product ? (
              <Link href={`/products/${rfq.product.slug}`} className="underline-offset-2 hover:underline">
                {rfq.product.name}
              </Link>
            ) : (
              'Product no longer listed'
            )}
          </p>
          <p className="m-0 mt-1 text-[13px]" style={{ color: 'var(--ink-3)' }}>
            {rfq.rfqNumber} · requested {formatDate(rfq.createdAt)}
          </p>
        </div>
        <StatusTag status={rfq.status} label={STATUS_LABEL[rfq.status]} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[14px] sm:grid-cols-4">
        <div>
          <dt style={{ color: 'var(--ink-3)' }}>Quantity</dt>
          <dd className="m-0 text-ink">{rfq.quantity.toLocaleString('en-IN')}</dd>
        </div>
        <div>
          <dt style={{ color: 'var(--ink-3)' }}>Your target</dt>
          <dd className="m-0 text-ink">
            {rfq.desiredPrice !== null ? `${formatCurrency(rfq.desiredPrice)}/pc` : '—'}
          </dd>
        </div>
        <div>
          <dt style={{ color: 'var(--ink-3)' }}>Needed by</dt>
          <dd className="m-0 text-ink">{rfq.deliveryDate ? formatDate(rfq.deliveryDate) : '—'}</dd>
        </div>
        <div>
          <dt style={{ color: 'var(--ink-3)' }}>Our quote</dt>
          <dd className="m-0 font-semibold text-ink">
            {rfq.quotedPrice !== null ? `${formatCurrency(rfq.quotedPrice)}/pc` : '—'}
          </dd>
        </div>
      </dl>

      {rfq.specialRequirements && (
        <p className="m-0 mt-3 text-[13px]" style={{ color: 'var(--ink-2)', overflowWrap: 'anywhere' }}>
          {rfq.specialRequirements}
        </p>
      )}

      {(rfq.quotedPrice !== null || rfq.notes) && rfq.status !== 'PENDING' && (
        <div
          className="mt-4 border px-4 py-3 text-[14px]"
          style={{
            borderColor: canRespond ? 'var(--brand)' : 'var(--border)',
            background: canRespond ? 'var(--brand-soft)' : 'transparent',
          }}
        >
          {rfq.quotedPrice !== null && (
            <p className="m-0 text-ink">
              <strong>{formatCurrency(rfq.quotedPrice * rfq.quantity)}</strong> total for{' '}
              {rfq.quantity.toLocaleString('en-IN')} pieces
              {rfq.expiryDate && rfq.status === 'QUOTED'
                ? ` · valid until ${formatDate(rfq.expiryDate)}`
                : ''}
            </p>
          )}
          {rfq.notes && (
            <p className="m-0 mt-1" style={{ color: 'var(--ink-2)', overflowWrap: 'anywhere' }}>
              {rfq.notes}
            </p>
          )}
          {canRespond && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" loading={busy} onClick={() => onRespond(rfq, 'accept')}>
                Accept quote
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onRespond(rfq, 'reject')}>
                Decline
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
};

export default function B2BAccountPage() {
  const router = useRouter();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);

  const [profile, setProfile] = useState<B2BProfile | null>(null);
  const [values, setValues] = useState<ProfileFormValues>(EMPTY_VALUES);
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [bulkOrders, setBulkOrders] = useState<BulkOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.replace('/auth/login?redirect=/b2b/account');
  }, [isInitialized, user, router]);

  const load = useCallback(
    () =>
      Promise.all([getMyB2BProfile(), getMyRfqs(), getMyBulkOrders()])
        .then(([p, r, b]) => {
          setProfile(p);
          if (p) setValues(valuesFrom(p));
          setRfqs(r);
          setBulkOrders(b);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const set = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    const pan = values.panNumber.replace(/\s+/g, '').toUpperCase();
    const gstin = values.gstNumber.replace(/\s+/g, '').toUpperCase();
    if (!values.companyName.trim()) {
      toast.error('Your company needs a name.');
      return;
    }
    if (pan && !PAN_PATTERN.test(pan)) {
      toast.error('PAN must look like ABCDE1234F.');
      return;
    }
    if (gstin && !GSTIN_PATTERN.test(gstin)) {
      toast.error('GSTIN is 15 characters, e.g. 27ABCDE1234F1Z5.');
      return;
    }
    if (pan && gstin && gstin.slice(2, 12) !== pan) {
      toast.error('The GSTIN does not contain this PAN — check both for a typo.');
      return;
    }
    const employees = values.employeeCount.trim();
    if (employees && !/^\d+$/.test(employees)) {
      toast.error('Employee count must be a whole number.');
      return;
    }
    const budget = values.monthlyBudget.trim();
    if (budget && !(Number(budget) >= 0)) {
      toast.error('Monthly budget must be an amount in rupees.');
      return;
    }

    setIsSaving(true);
    try {
      const { profile: saved, message } = await saveMyB2BProfile({
        companyName: values.companyName.trim(),
        businessType: values.businessType,
        gstNumber: gstin || null,
        panNumber: pan || null,
        companyRegistration: values.companyRegistration.trim() || null,
        businessCategory: values.businessCategory.trim() || null,
        website: values.website.trim() || null,
        businessDescription: values.businessDescription.trim() || null,
        employeeCount: employees ? Number(employees) : null,
        monthlyBudget: budget ? Number(budget) : null,
      });
      setProfile(saved);
      setValues(valuesFrom(saved));
      toast.success(message);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const respond = async (rfq: Rfq, decision: 'accept' | 'reject') => {
    if (
      decision === 'reject' &&
      !window.confirm(`Decline the quote for ${rfq.product?.name ?? rfq.rfqNumber}?`)
    ) {
      return;
    }
    setRespondingId(rfq.id);
    try {
      const { message } = await respondToQuote(rfq.id, decision);
      toast.success(message);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRespondingId(null);
      void load();
    }
  };

  if (!isInitialized || (user && isLoading)) {
    return <LoadingSpinner className="min-h-[50vh]" size="lg" />;
  }
  if (!user) return null;

  const quotesWaiting = rfqs.filter((r) => r.status === 'QUOTED').length;

  return (
    <main className="section-y">
      <div className="container-max">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Bulk orders', href: '/b2b' },
            { label: 'Business account' },
          ]}
        />

        <header className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div>
            <h1
              className="m-0 text-ink"
              style={{ fontSize: 'clamp(26px, 3.6vw, 38px)', lineHeight: 1.05, letterSpacing: '-0.03em' }}
            >
              Business account
            </h1>
            <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              Your company details, the quotes we have sent you, and your bulk orders.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard" className="btn btn-outline btn-sm">
              My account
            </Link>
            <Link href="/b2b" className="btn btn-primary btn-sm">
              Request a quote
            </Link>
          </div>
        </header>

        {error && <p className="alert alert-error mt-6 text-sm">{error}</p>}

        {quotesWaiting > 0 && (
          <div
            className="mt-6 border px-4 py-3.5 text-[14px]"
            style={{ borderColor: 'var(--brand)', background: 'var(--brand-soft)' }}
            role="status"
          >
            <p className="m-0 font-semibold text-ink">
              {quotesWaiting === 1 ? 'A quote is' : `${quotesWaiting} quotes are`} waiting for your
              answer
            </p>
          </div>
        )}

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <form onSubmit={saveProfile} className="flex flex-col gap-4">
            <SectionTitle
              sub={
                profile ? (
                  profile.isVerified ? (
                    <>
                      <StatusTag status="ACCEPTED" label="Verified" /> Wholesale pricing is unlocked.
                      Changing the company name, GSTIN or PAN sends it for verification again.
                    </>
                  ) : (
                    <>
                      <StatusTag status="PENDING" label="Awaiting verification" /> You can request
                      quotes now; our team verifies your business before wholesale pricing unlocks.
                    </>
                  )
                ) : (
                  'Tell us about your business. You can request quotes as soon as this is saved.'
                )
              }
            >
              Company profile
            </SectionTitle>

            <Input
              id="b2b-company"
              label="Company name *"
              value={values.companyName}
              onChange={(e) => set('companyName', e.target.value)}
              maxLength={120}
            />
            <div>
              <label htmlFor="b2b-type" className="block text-sm font-medium text-black mb-1">
                Business type
              </label>
              <select
                id="b2b-type"
                value={values.businessType}
                onChange={(e) => set('businessType', e.target.value)}
              >
                {[
                  ...BUSINESS_TYPES,
                  ...(BUSINESS_TYPES.includes(values.businessType) ? [] : [values.businessType]),
                ].map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="b2b-gstin"
                label="GSTIN"
                value={values.gstNumber}
                onChange={(e) => set('gstNumber', e.target.value.toUpperCase())}
                maxLength={15}
                autoComplete="off"
                placeholder="27ABCDE1234F1Z5"
              />
              <Input
                id="b2b-pan"
                label="PAN"
                value={values.panNumber}
                onChange={(e) => set('panNumber', e.target.value.toUpperCase())}
                maxLength={10}
                autoComplete="off"
                placeholder="ABCDE1234F"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="b2b-registration"
                label="Registration number (CIN/LLPIN)"
                value={values.companyRegistration}
                onChange={(e) => set('companyRegistration', e.target.value)}
                maxLength={60}
              />
              <Input
                id="b2b-category"
                label="Industry"
                value={values.businessCategory}
                onChange={(e) => set('businessCategory', e.target.value)}
                maxLength={80}
                placeholder="e.g. IT services"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                id="b2b-website"
                label="Website"
                type="url"
                value={values.website}
                onChange={(e) => set('website', e.target.value)}
                placeholder="https://"
              />
              <Input
                id="b2b-employees"
                label="Employees"
                type="number"
                min={0}
                inputMode="numeric"
                value={values.employeeCount}
                onChange={(e) => set('employeeCount', e.target.value)}
              />
              <Input
                id="b2b-budget"
                label="Monthly budget (₹)"
                type="number"
                min={0}
                inputMode="decimal"
                value={values.monthlyBudget}
                onChange={(e) => set('monthlyBudget', e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="b2b-description" className="block text-sm font-medium text-black mb-1">
                About your business
              </label>
              <textarea
                id="b2b-description"
                rows={3}
                maxLength={2000}
                value={values.businessDescription}
                onChange={(e) => set('businessDescription', e.target.value)}
                placeholder="What you order for — uniforms, events, merchandise…"
              />
            </div>
            <div>
              <Button type="submit" variant="primary" loading={isSaving}>
                {profile ? 'Save profile' : 'Create profile'}
              </Button>
            </div>
          </form>

          <div className="flex flex-col gap-10">
            <section className="flex flex-col gap-4">
              <SectionTitle sub="Quotes are valid until the date shown. Accepting one places a bulk order at that price.">
                Quote requests
              </SectionTitle>
              {rfqs.length === 0 ? (
                <p className="m-0 border border-dashed border-line p-6 text-center text-[14px]" style={{ color: 'var(--ink-3)' }}>
                  No quote requests yet.{' '}
                  <Link href="/b2b" className="underline underline-offset-2">
                    Request your first quote
                  </Link>
                  .
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {rfqs.map((rfq) => (
                    <RfqRow
                      key={rfq.id}
                      rfq={rfq}
                      busy={respondingId === rfq.id}
                      onRespond={respond}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-4">
              <SectionTitle>Bulk orders</SectionTitle>
              {bulkOrders.length === 0 ? (
                <p className="m-0 border border-dashed border-line p-6 text-center text-[14px]" style={{ color: 'var(--ink-3)' }}>
                  Accepted quotes become bulk orders and appear here.
                </p>
              ) : (
                <div className="overflow-x-auto border border-line">
                  <table className="w-full min-w-[560px] text-left text-[14px]">
                    <thead style={{ background: 'var(--surface-2)' }}>
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Order</th>
                        <th className="px-4 py-2.5 font-semibold">Product</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Qty</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                        <th className="px-4 py-2.5 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkOrders.map((order) => (
                        <tr key={order.id} className="border-t border-line">
                          <td className="px-4 py-3">
                            <span className="font-medium text-ink">{order.orderNumber}</span>
                            <br />
                            <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
                              {formatDate(order.createdAt)}
                            </span>
                          </td>
                          <td className="px-4 py-3">{order.product?.name ?? '—'}</td>
                          <td className="px-4 py-3 text-right">{order.quantity.toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3 text-right">
                            {formatCurrency(order.totalPrice)}
                            <br />
                            <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
                              {formatCurrency(order.unitPrice)}/pc
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <StatusTag status={order.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
