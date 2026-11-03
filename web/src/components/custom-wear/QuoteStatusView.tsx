'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Badge, Button, Input, SkeletonList } from '@/components/common';
import { useHasToken } from '@/hooks/useHasToken';
import { fetchMyQuotes, lookupQuote } from '@/lib/custom-wear/api';
import { formatCurrency, formatDate } from '@/utils/helpers';
import type { CustomWearQuoteStatus, CustomWearQuoteSummary } from '@/types/custom-wear';

const STATUS: Record<
  CustomWearQuoteStatus,
  { label: string; variant: 'info' | 'warning' | 'success' | 'danger' | 'secondary'; note: string }
> = {
  NEW: { label: 'Received', variant: 'info', note: 'Our team will review your artwork and reply.' },
  CONTACTED: { label: 'In discussion', variant: 'warning', note: 'We have been in touch about the details.' },
  QUOTED: { label: 'Quoted', variant: 'success', note: 'Your price has been sent. Reply to the email to go ahead.' },
  WON: { label: 'Confirmed', variant: 'success', note: 'Your order is confirmed and in production planning.' },
  LOST: { label: 'Closed', variant: 'secondary', note: 'This request is closed. Contact us to reopen it.' },
};

const QuoteCard: React.FC<{ quote: CustomWearQuoteSummary }> = ({ quote }) => {
  const status = STATUS[quote.status] ?? STATUS.NEW;
  return (
    <li className="border border-line bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 font-semibold tracking-[0.04em] text-ink">{quote.reference}</p>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      <Link
        href={`/custom-wear/product/${quote.productSlug}`}
        className="mt-2 block font-medium hover:text-primary-700"
      >
        {quote.productName}
      </Link>
      <p className="m-0 text-xs text-neutral-500">
        {[
          quote.colorName,
          quote.sizes.length > 0 ? `Size ${quote.sizes.join(', ')}` : null,
          `${quote.quantity} units`,
          quote.locations.length > 0 ? quote.locations.join(', ') : null,
          quote.designFiles.length > 0
            ? `${quote.designFiles.length} artwork file${quote.designFiles.length === 1 ? '' : 's'}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <p className="m-0 mt-2 text-sm" style={{ color: 'var(--ink-2)' }}>
        {status.note}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs" style={{ color: 'var(--ink-3)' }}>
        <span>Requested {formatDate(quote.createdAt)}</span>
        {quote.requiredBy && <span>Needed by {quote.requiredBy}</span>}
        {quote.quotedPrice != null && (
          <span className="font-semibold text-ink">Quoted {formatCurrency(quote.quotedPrice)}</span>
        )}
      </div>
    </li>
  );
};

/** Guest status check: reference + the email the request was sent with. */
const GuestLookup: React.FC = () => {
  const params = useSearchParams();
  const [reference, setReference] = useState(params.get('reference') ?? '');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<CustomWearQuoteSummary | null>(null);

  const check = async (ref: string, mail: string) => {
    if (!/^CWQ-\d{4}-\d{6}$/i.test(ref.trim())) {
      setError('References look like CWQ-2026-123456.');
      return;
    }
    if (!mail.trim()) {
      setError('Enter the email you used for the request.');
      return;
    }
    setLoading(true);
    setError(null);
    setQuote(null);
    try {
      setQuote(await lookupQuote(ref, mail));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not look up that quote.');
    } finally {
      setLoading(false);
    }
  };

  // Arriving from the confirmation email or screen: look it up straight away.
  // A ref, not state: whether the one-off lookup ran is not something to render.
  // The lookup itself is deferred a tick so no state is set inside the effect.
  const autoChecked = useRef(false);
  useEffect(() => {
    if (autoChecked.current) return;
    autoChecked.current = true;
    const ref = params.get('reference');
    const mail = params.get('email');
    if (ref && mail) void Promise.resolve().then(() => check(ref, mail));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="border border-line p-4 md:p-6" style={{ background: 'var(--surface-2)' }}>
      <h2 className="m-0 text-lg text-ink">Check a request</h2>
      <p className="mt-1 mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
        Use the reference from your confirmation and the email you sent it from.
      </p>
      <form
        className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void check(reference, email);
        }}
      >
        <Input
          label="Reference"
          id="cwq-reference"
          placeholder="CWQ-2026-123456"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
        <Input
          label="Email"
          id="cwq-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button type="submit" variant="primary" loading={isLoading}>
          Check status
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-3 mb-0 text-sm text-red-600">
          {error}
        </p>
      )}
      {quote && (
        <ul className="m-0 mt-4 list-none p-0">
          <QuoteCard quote={quote} />
        </ul>
      )}
    </section>
  );
};

const MyQuotes: React.FC = () => {
  const [quotes, setQuotes] = useState<CustomWearQuoteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyQuotes()
      .then((rows) => {
        if (!cancelled) setQuotes(rows);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load your quotes.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!quotes) return <SkeletonList rows={3} />;
  if (quotes.length === 0) {
    return (
      <div className="border border-line px-6 py-10 text-center" style={{ background: 'var(--surface-2)' }}>
        <h2 className="m-0 text-xl text-ink">No custom wear requests yet</h2>
        <p className="mx-auto mt-2 max-w-[42ch] text-sm" style={{ color: 'var(--ink-2)' }}>
          Design a garment, add it to your cart and request a quote — it will appear here.
        </p>
        <Link href="/custom-wear" className="btn btn-primary mt-5 inline-flex">
          Browse custom wear
        </Link>
      </div>
    );
  }
  return (
    <ul className="m-0 grid list-none gap-4 p-0">
      {quotes.map((quote) => (
        <QuoteCard key={quote.reference} quote={quote} />
      ))}
    </ul>
  );
};

/** `/custom-wear/quotes`: the signed-in list plus a guest lookup. */
export const QuoteStatusView: React.FC = () => {
  const hasToken = useHasToken();

  return (
    <main className="section-y">
      <div className="container-max max-w-3xl">
        <header className="page-intro page-intro--compact">
          <p>Custom wear</p>
          <h1>My custom wear quotes</h1>
        </header>

        {hasToken === null ? (
          <SkeletonList rows={2} />
        ) : hasToken ? (
          <MyQuotes />
        ) : (
          <p className="mb-6 text-sm" style={{ color: 'var(--ink-2)' }}>
            <Link href="/auth/login?redirect=/custom-wear/quotes" className="font-medium underline">
              Sign in
            </Link>{' '}
            to see every request on your account, or check one below.
          </p>
        )}

        <div className="mt-8">
          <GuestLookup />
        </div>
      </div>
    </main>
  );
};
