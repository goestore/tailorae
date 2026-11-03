'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Button, Input, LoadingSpinner } from '@/components/common';
import { useSeller } from '@/components/seller/SellerContext';
import { formatPaise } from '@/lib/money';
import {
  EDITABLE_STATUSES,
  PENDING_SHOP_KEY,
  ROLE_LABELS,
  createBusiness,
  getContactVerification,
  getEarnings,
  getSellerSummary,
  resendEmailConfirmation,
  sendPhoneCode,
  submitApplication,
  verifyPhoneCode,
  type EarningsSummary,
  type SellerDashboard,
  type SellerMe,
  type Shop,
} from '@/lib/seller-api';
import {
  BusinessFields,
  EMPTY_BUSINESS,
  businessPayload,
  businessProblem,
  type BusinessForm,
} from './_components/CompanyFields';
import { TextArea } from './_components/fields';
import { Notice, PageHeader, SectionTitle, Stat, StatusNotice, formatDate, prettyStatus } from './_components/ui';

/**
 * Seller Central's overview.
 *
 * Until the shop is approved this is the onboarding checklist, in order:
 * confirm email, confirm phone, create the business, upload the documents,
 * add the bank account, submit (docs/ACCOUNTS.md, "Seller"). It is driven by
 * what the API says is missing (`GET /seller/me` → `checklist`) plus the
 * account's own email/phone state, so a step is ticked exactly when the
 * server agrees it is done. Once approved it becomes the dashboard.
 */
export default function SellerOverviewPage() {
  const { me, refresh, can } = useSeller();
  const shop = me?.shop ?? null;

  if (!me) return <LoadingSpinner className="min-h-[50vh]" size="lg" />;

  return (
    <main className="section-y">
      <div className="container-max">
        <PageHeader
          title={shop ? shop.shopName : 'Become a seller'}
          lead={
            shop ? (
              <>
                {shop.status === 'APPROVED' ? (
                  <>
                    Approved ·{' '}
                    <Link href={`/sellers/${shop.shopSlug}`} className="underline underline-offset-2 hover:text-ink">
                      view your shop page
                    </Link>
                  </>
                ) : (
                  'Not selling yet — your listings are not visible to shoppers.'
                )}
                {me.role ? ` · you are ${ROLE_LABELS[me.role].toLowerCase()}` : ''}
                {shop.commissionRateBp != null ? ` · ${shop.commissionRateBp / 100}% commission` : ''}
              </>
            ) : (
              'A few steps and you can start listing. You can stop at any point and pick up where you left off.'
            )
          }
        />

        {shop && <StatusNotice shop={shop} />}

        {shop?.status === 'APPROVED' ? (
          <Dashboard shop={shop} canFinance={can('FINANCE')} canOrders={can('ORDERS')} canCatalog={can('CATALOG')} />
        ) : (
          <Onboarding me={me} refresh={refresh} isOwner={!shop || can('PROFILE')} />
        )}
      </div>
    </main>
  );
}

/* ── Onboarding ────────────────────────────────────────────────────── */

type StepState = 'done' | 'current' | 'todo';

const Step: React.FC<{
  n: number;
  title: string;
  state: StepState;
  children?: React.ReactNode;
}> = ({ n, title, state, children }) => (
  <li
    className="border border-line p-4 md:p-5"
    style={state === 'current' ? { borderColor: 'var(--ink)' } : undefined}
    aria-current={state === 'current' ? 'step' : undefined}
  >
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
        style={
          state === 'done'
            ? { background: 'var(--ink)', color: 'var(--brand)' }
            : state === 'current'
              ? { background: 'var(--brand)', color: 'var(--ink)' }
              : { border: '1px solid var(--border-strong)', color: 'var(--ink-3)' }
        }
      >
        {state === 'done' ? '✓' : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[15px] font-semibold text-ink">
          {title}
          <span className="sr-only">{state === 'done' ? ' (done)' : state === 'current' ? ' (next)' : ''}</span>
        </p>
        {children && <div className="mt-2 text-[14px]" style={{ color: 'var(--ink-2)' }}>{children}</div>}
      </div>
    </div>
  </li>
);

/** Which checklist line belongs to which step (the server's own wording). */
const isEmailItem = (item: string) => /^confirm your email/i.test(item);
const isPhoneItem = (item: string) => /^confirm your phone/i.test(item);
const isDocumentItem = (item: string) => /^upload/i.test(item);
const isBankItem = (item: string) => /bank account/i.test(item);
const isBusinessItem = (item: string) =>
  !isEmailItem(item) && !isPhoneItem(item) && !isDocumentItem(item) && !isBankItem(item) && !/create your business/i.test(item);

const Onboarding: React.FC<{
  me: SellerMe;
  refresh: () => Promise<SellerMe | null>;
  isOwner: boolean;
}> = ({ me, refresh, isOwner }) => {
  const shop = me.shop;
  const [contact, setContact] = useState<{ email: boolean; phone: boolean } | null>(null);

  const loadContact = useCallback(
    () =>
      getContactVerification()
        .then(setContact)
        .catch(() => setContact({ email: false, phone: false })),
    []
  );

  useEffect(() => {
    void loadContact();
  }, [loadContact]);

  const after = async () => {
    await Promise.all([loadContact(), refresh()]);
  };

  if (!contact) return <LoadingSpinner className="min-h-[30vh]" />;

  if (shop && !isOwner) {
    return (
      <Notice title="The owner is finishing the application" tone="plain">
        Your role in {shop.shopName} does not include the business details, documents or bank account. Once the
        shop is approved, the pages for your role open here.
      </Notice>
    );
  }

  const checklist = me.checklist;
  const businessMissing = checklist.filter(isBusinessItem);
  const docsMissing = checklist.filter(isDocumentItem);
  const bankMissing = checklist.some(isBankItem);
  const editable = shop ? EDITABLE_STATUSES.includes(shop.status) : true;

  const done = {
    email: contact.email,
    phone: contact.phone,
    business: Boolean(shop) && businessMissing.length === 0,
    documents: Boolean(shop) && docsMissing.length === 0,
    bank: Boolean(shop) && !bankMissing,
    submitted: Boolean(shop) && !editable,
  };
  const order: Array<keyof typeof done> = ['email', 'phone', 'business', 'documents', 'bank', 'submitted'];
  const firstOpen = order.find((key) => !done[key]);
  const state = (key: keyof typeof done): StepState => (done[key] ? 'done' : key === firstOpen ? 'current' : 'todo');

  return (
    <ol className="m-0 mt-8 flex max-w-[760px] list-none flex-col gap-3 p-0">
      <Step n={1} title="Confirm your email address" state={state('email')}>
        {done.email ? 'Confirmed.' : <EmailStep onDone={after} />}
      </Step>
      <Step n={2} title="Confirm your phone number" state={state('phone')}>
        {done.phone ? 'Confirmed.' : <PhoneStep onDone={after} />}
      </Step>
      <Step n={3} title="Tell us about your business" state={state('business')}>
        {!shop ? (
          me.applicationsOpen ? (
            <CreateBusinessForm onDone={after} />
          ) : (
            <p className="m-0">
              We are not taking open applications right now. If you would like to sell on TAILORAE, tell us about
              your business and we will be in touch.{' '}
              <Link href="/info/contact" className="underline underline-offset-2">
                Contact us
              </Link>
              .
            </p>
          )
        ) : businessMissing.length ? (
          <>
            <MissingList items={businessMissing} />
            <Link href="/seller/settings#business" className="btn btn-outline btn-sm mt-3">
              Complete business details
            </Link>
          </>
        ) : (
          'Saved. You can change the details in Shop settings.'
        )}
      </Step>
      <Step n={4} title="Upload your documents" state={state('documents')}>
        {!shop ? (
          'PAN card, plus the GST certificate if you are registered. Private to you and our review team.'
        ) : docsMissing.length ? (
          <>
            <MissingList items={docsMissing} />
            <Link href="/seller/verification" className="btn btn-outline btn-sm mt-3">
              Upload documents
            </Link>
          </>
        ) : (
          <>
            On file.{' '}
            <Link href="/seller/verification" className="underline underline-offset-2">
              See your documents
            </Link>
            .
          </>
        )}
      </Step>
      <Step n={5} title="Add the bank account for payouts" state={state('bank')}>
        {!shop ? (
          'Where we send what you earn. We only ever show it back masked.'
        ) : bankMissing ? (
          <Link href="/seller/settings#bank" className="btn btn-outline btn-sm">
            Add bank account
          </Link>
        ) : (
          'On file.'
        )}
      </Step>
      <Step n={6} title="Submit for review" state={state('submitted')}>
        {shop && !editable ? (
          'Submitted. We will email you when it is decided.'
        ) : (
          <SubmitStep shop={shop} checklist={checklist} onDone={after} />
        )}
      </Step>
    </ol>
  );
};

const MissingList: React.FC<{ items: string[] }> = ({ items }) => (
  <ul className="m-0 list-disc pl-5">
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
);

const EmailStep: React.FC<{ onDone: () => Promise<void> }> = ({ onDone }) => {
  const [busy, setBusy] = useState(false);
  const resend = async () => {
    setBusy(true);
    try {
      toast.success(await resendEmailConfirmation());
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <p className="m-0">
        We sent a confirmation link to your email when you signed up. Open it, then come back here.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" loading={busy} onClick={resend}>
          Send the link again
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void onDone()}>
          I have confirmed it
        </Button>
      </div>
    </>
  );
};

const PhoneStep: React.FC<{ onDone: () => Promise<void> }> = ({ onDone }) => {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<null | 'send' | 'verify'>(null);

  const send = async () => {
    setBusy('send');
    try {
      toast.success(await sendPhoneCode());
      setSent(true);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error('Enter the 6-digit code from the text message.');
      return;
    }
    setBusy('verify');
    try {
      toast.success(await verifyPhoneCode(code));
      await onDone();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <p className="m-0">We text a 6-digit code to the number you signed up with.</p>
      {!sent ? (
        <Button size="sm" className="mt-3" loading={busy === 'send'} onClick={send}>
          Send code
        </Button>
      ) : (
        <form onSubmit={verify} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="w-[160px]">
            <Input
              id="phone-code"
              label="Code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
            />
          </div>
          <Button type="submit" size="sm" loading={busy === 'verify'}>
            Confirm
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={send}>
            Send a new code
          </Button>
        </form>
      )}
    </>
  );
};

const CreateBusinessForm: React.FC<{ onDone: () => Promise<void> }> = ({ onDone }) => {
  // Prefilled from the /sell landing page, which stashes the name before sign-up.
  const [shopName, setShopName] = useState(() => {
    try {
      return sessionStorage.getItem(PENDING_SHOP_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [shopDescription, setShopDescription] = useState('');
  const [form, setForm] = useState<BusinessForm>(EMPTY_BUSINESS);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!shopName.trim()) {
      toast.error('Give your shop a name.');
      return;
    }
    const problem = businessProblem(form);
    if (problem) {
      toast.error(problem);
      return;
    }
    setIsSaving(true);
    try {
      await createBusiness({
        shopName: shopName.trim(),
        shopDescription: shopDescription.trim() || undefined,
        ...businessPayload(form),
      });
      try {
        sessionStorage.removeItem(PENDING_SHOP_KEY);
      } catch {
        /* storage blocked */
      }
      toast.success('Your business is saved.');
      await onDone();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-2 flex flex-col gap-4">
      <Input
        id="shop-name"
        label="Shop name *"
        value={shopName}
        onChange={(event) => setShopName(event.target.value)}
        maxLength={80}
        placeholder="The name shoppers will see"
        helperText="This becomes your shop page address, so pick the name you trade under."
      />
      <TextArea
        id="shop-description"
        label="What do you sell?"
        rows={3}
        maxLength={2000}
        value={shopDescription}
        onChange={(event) => setShopDescription(event.target.value)}
        placeholder="A line or two about your range — this shows on your shop page."
      />
      <BusinessFields value={form} onChange={setForm} />
      <div>
        <Button type="submit" size="lg" loading={isSaving}>
          Save and continue
        </Button>
      </div>
    </form>
  );
};

const SubmitStep: React.FC<{
  shop: Shop | null;
  checklist: string[];
  onDone: () => Promise<void>;
}> = ({ shop, checklist, onDone }) => {
  const [busy, setBusy] = useState(false);
  const ready = Boolean(shop) && checklist.length === 0;

  const submit = async () => {
    setBusy(true);
    try {
      await submitApplication();
      toast.success('Application submitted.');
      await onDone();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="m-0">
        {ready
          ? shop?.status === 'NEEDS_INFO'
            ? 'Everything is in. Send it back to us for another look.'
            : 'Everything is in. Our team checks your business, documents and bank account, usually within one working day.'
          : 'Once everything above is done, send your application to our team.'}
      </p>
      {!ready && shop && checklist.length > 0 && (
        <div className="mt-2">
          <p className="m-0 text-meta" style={{ color: 'var(--ink-3)' }}>
            Still missing:
          </p>
          <MissingList items={checklist} />
        </div>
      )}
      <Button size="sm" className="mt-3" disabled={!ready} loading={busy} onClick={submit}>
        Submit application
      </Button>
    </>
  );
};

/* ── Dashboard ─────────────────────────────────────────────────────── */

const Dashboard: React.FC<{ shop: Shop; canFinance: boolean; canOrders: boolean; canCatalog: boolean }> = ({
  shop,
  canFinance,
  canOrders,
  canCatalog,
}) => {
  const [summary, setSummary] = useState<SellerDashboard | null>(null);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([getSellerSummary(), canFinance ? getEarnings().catch(() => null) : Promise.resolve(null)])
      .then(([s, e]) => {
        if (!alive) return;
        setSummary(s);
        setEarnings(e);
      })
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [canFinance]);

  if (loading) return <LoadingSpinner className="min-h-[30vh]" />;

  return (
    <>
      {error && <p className="alert alert-error mt-6 text-sm">{error}</p>}

      {summary && (
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="To ship" value={String(summary.ordersToShip)} note="Accepted, not yet shipped" />
          <Stat label="Orders this month" value={String(summary.ordersThisMonth)} />
          <Stat label="Sales this month" value={formatPaise(summary.salesThisMonthPaise)} note="What buyers paid" />
          {earnings ? (
            <Stat
              label="Ready to pay"
              value={formatPaise(earnings.balancePaise)}
              note={earnings.heldPaise > 0 ? `${formatPaise(earnings.heldPaise)} held` : 'Nothing held'}
            />
          ) : (
            <Stat
              label="Rating"
              value={shop.ratingCount > 0 ? shop.rating.toFixed(1) : '—'}
              note={shop.ratingCount > 0 ? `${shop.ratingCount} ratings` : 'No ratings yet'}
            />
          )}
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        {canOrders && (
          <Link href="/seller/orders" className="btn btn-primary">
            Manage orders
          </Link>
        )}
        {canCatalog && (
          <>
            <Link href="/seller/products" className="btn btn-outline">
              My products
            </Link>
            <Link href="/seller/products/new" className="btn btn-outline">
              List a product
            </Link>
          </>
        )}
        {canFinance && (
          <Link href="/seller/earnings" className="btn btn-outline">
            Earnings &amp; payouts
          </Link>
        )}
        <Link href="/seller/team" className="btn btn-outline">
          Team
        </Link>
      </div>

      {summary && summary.lowStock.length > 0 && (
        <section className="mt-10">
          <SectionTitle>Running low</SectionTitle>
          <p className="m-0 mt-1 text-meta" style={{ color: 'var(--ink-3)' }}>
            {shop.lowStockThreshold} or fewer left. Restock before these sell out.
          </p>
          <ul className="m-0 mt-4 flex list-none flex-col gap-px p-0" style={{ background: 'var(--border)' }}>
            {summary.lowStock.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3.5"
                style={{ background: 'var(--surface)' }}
              >
                <Link href={`/seller/products/${item.id}`} className="min-w-0 truncate text-[14px] text-ink hover:underline">
                  {item.name}
                </Link>
                <span className="font-mono text-small" style={{ color: 'var(--ink-3)' }}>
                  {item.sku}
                </span>
                <span
                  className="text-meta font-semibold"
                  style={{ color: item.quantity === 0 ? 'var(--sale)' : 'var(--ink)' }}
                >
                  {item.quantity === 0 ? 'Sold out' : `${item.quantity} left`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary && (
        <section className="mt-10">
          <SectionTitle>Recent orders</SectionTitle>
          {summary.recentOrders.length === 0 ? (
            <p className="mt-3 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              Nothing yet. Orders appear here as soon as someone buys from you.
            </p>
          ) : (
            <ul className="m-0 mt-4 flex list-none flex-col gap-px p-0" style={{ background: 'var(--border)' }}>
              {summary.recentOrders.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3.5"
                  style={{ background: 'var(--surface)' }}
                >
                  <span className="font-mono text-meta text-ink">{order.orderNumber}</span>
                  <span className="text-meta" style={{ color: 'var(--ink-3)' }}>
                    {formatDate(order.createdAt)} · {prettyStatus(order.status).toLowerCase()}
                  </span>
                  <span className="text-meta" style={{ color: 'var(--ink-2)' }}>
                    {formatPaise(order.totalPaise)} paid
                  </span>
                  <span className="text-meta font-semibold text-ink">{formatPaise(order.payoutPaise)} to you</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
};
