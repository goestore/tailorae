'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Icon } from '@/components/common';
import { formatCurrency } from '@/utils/helpers';
import { PENDING_SHOP_KEY, getApplicationsOpen } from '@/lib/seller-api';
import { RootState } from '@/store';

const HIGHLIGHT = { color: 'var(--brand)' } as const;

const STEPS = [
  {
    icon: 'building',
    title: 'Create your shop',
    body: 'Sign in, name your shop and tell buyers what you make. It takes a couple of minutes.',
  },
  {
    icon: 'tshirt',
    title: 'List your products',
    body: 'Add photos, sizes, colours and prices. Your listings sit alongside our catalogue.',
  },
  {
    icon: 'truck',
    title: 'Ship and get paid',
    body: 'Once approved, orders land in your dashboard. You dispatch; we handle checkout, payment and payouts.',
  },
];

const PERKS = [
  {
    icon: 'sparkle',
    title: 'Your own shop page',
    body: 'A public page with your name, story and full range.',
  },
  {
    icon: 'tag',
    title: 'Checkout & payments',
    body: 'Buyers pay through our secure checkout — no gateway to set up.',
  },
  {
    icon: 'printer',
    title: 'Seen by our shoppers',
    body: 'Approved listings appear in the main catalogue and search.',
  },
  {
    icon: 'heart',
    title: 'Orders & payouts dashboard',
    body: 'Track every order, return and payout in one place.',
  },
];

/**
 * The signup card on the right of the hero.
 *
 * When the owner has closed public applications (admin settings), the form is
 * replaced with a note that registration is by invitation, rather than
 * collecting a shop name for an application the server will refuse.
 */
function StartCard({ onStart, closed }: { onStart: (shopName: string) => void; closed?: boolean }) {
  const [shopName, setShopName] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!shopName.trim()) {
      toast.error('Give your shop a name.');
      return;
    }
    onStart(shopName.trim());
  };

  return (
    <div
      className="overflow-hidden bg-white shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
      style={{ borderRadius: 'var(--r-lg)' }}
    >
      <div className="relative overflow-hidden bg-brand-gradient px-6 pb-7 pt-8 text-center text-ink">
        {/* Soft disc in the corner, as in the reference card. */}
        <span
          aria-hidden="true"
          className="absolute -right-12 -top-12 h-40 w-40 rounded-full"
          style={{ background: 'rgba(255,255,255,0.18)' }}
        />
        <span
          className="relative mx-auto flex h-12 w-12 items-center justify-center bg-white/30"
          style={{ borderRadius: 'var(--r-md)' }}
        >
          <Icon name="sparkle" className="h-6 w-6" />
        </span>
        <p
          className="relative m-0 mt-4 text-[22px] font-bold leading-tight"
          style={{ letterSpacing: '-0.02em' }}
        >
          Open your shop on
        </p>
        <p
          className="relative m-0 mt-2 inline-block bg-white px-3 py-1 text-[22px] font-extrabold leading-tight"
          style={{ borderRadius: 'var(--r-sm)', letterSpacing: '-0.02em' }}
        >
          Creative Impression
        </p>
        <p className="relative m-0 mt-3 text-[13px] font-medium" style={{ color: 'var(--ink-2)' }}>
          {closed ? 'By invitation only' : 'Free to apply · live once approved'}
        </p>
      </div>

      {closed ? (
        <div className="px-6 pb-6 pt-6 text-center">
          <p className="m-0 text-[15px] font-semibold text-ink">
            Seller registration is by invitation
          </p>
          <p className="m-0 mt-2 text-[13.5px]" style={{ color: 'var(--ink-2)', lineHeight: 1.6 }}>
            We are not taking open applications right now. Tell us about your business and we will
            get in touch if it is a fit.
          </p>
          <Link
            href="/info/contact"
            className="btn btn-lg btn-block mt-4 bg-brand-gradient font-semibold text-ink"
            style={{ borderRadius: 'var(--r-sm)', boxShadow: 'var(--shadow-brand)' }}
          >
            Contact us
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="px-6 pb-6 pt-6">
          <label htmlFor="sell-shop-name" className="mb-2">
            Shop name
          </label>
          <div
            className="flex overflow-hidden border border-[var(--border-strong)] focus-within:border-[var(--brand)] focus-within:shadow-[0_0_0_3px_var(--brand-soft)]"
            style={{ borderRadius: 'var(--r-sm)' }}
          >
            <span className="flex items-center border-r border-line bg-surface-2 px-3 text-[13px] font-semibold text-ink">
              Shop
            </span>
            <input
              id="sell-shop-name"
              value={shopName}
              onChange={(event) => setShopName(event.target.value)}
              placeholder="e.g. Coastal Threads"
              maxLength={80}
              autoComplete="organization"
              className="!border-0 !shadow-none"
              style={{ borderRadius: 0 }}
            />
          </div>
          <button
            type="submit"
            className="btn btn-lg btn-block mt-4 bg-brand-gradient font-semibold text-ink"
            style={{ borderRadius: 'var(--r-sm)', boxShadow: 'var(--shadow-brand)' }}
          >
            Start selling
          </button>
          <p
            className="m-0 mt-3 flex items-center justify-center gap-1.5 text-[12px]"
            style={{ color: 'var(--ink-3)' }}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="var(--brand-600)"
              strokeWidth={1.8}
              aria-hidden="true"
            >
              <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
            </svg>
            Secure sign-in · no card needed to apply
          </p>
        </form>
      )}
    </div>
  );
}

/** Rough monthly earnings from units, margin and commission — all user inputs. */
function EarningsCalculator() {
  const [perDay, setPerDay] = useState(10);
  const [margin, setMargin] = useState(250);
  const [commission, setCommission] = useState(10);

  const gross = perDay * margin * 30;
  const net = Math.max(0, gross * (1 - commission / 100));

  return (
    <div
      className="grid gap-6 border border-line p-5 md:grid-cols-[1.2fr_1fr] md:p-7"
      style={{ borderRadius: 'var(--r-lg)' }}
    >
      <div className="flex flex-col gap-5">
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="calc-per-day" className="m-0">
              Products sold per day
            </label>
            <span className="text-[15px] font-semibold text-ink">{perDay}</span>
          </div>
          <input
            id="calc-per-day"
            type="range"
            min={1}
            max={100}
            value={perDay}
            onChange={(e) => setPerDay(Number(e.target.value))}
            className="mt-2 !border-0 !p-0 !shadow-none accent-[var(--brand)]"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="calc-margin" className="mb-1.5">
              Margin per product (₹)
            </label>
            <input
              id="calc-margin"
              type="number"
              min={0}
              inputMode="numeric"
              value={margin}
              onChange={(e) => setMargin(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div>
            <label htmlFor="calc-commission" className="mb-1.5">
              Commission (%)
            </label>
            <input
              id="calc-commission"
              type="number"
              min={0}
              max={100}
              inputMode="decimal"
              value={commission}
              onChange={(e) =>
                setCommission(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
              }
            />
          </div>
        </div>
        <p className="m-0 text-[12px]" style={{ color: 'var(--ink-3)' }}>
          An illustration, not a promise. Your commission rate is confirmed when your shop is
          approved.
        </p>
      </div>

      <div
        className="flex flex-col justify-center bg-navy-glow p-6 text-white"
        style={{ borderRadius: 'var(--r-md)' }}
      >
        <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/60">
          Estimated monthly earnings
        </p>
        <p
          className="m-0 mt-2 font-extrabold leading-none"
          style={{ ...HIGHLIGHT, fontSize: 'clamp(30px, 4vw, 42px)', letterSpacing: '-0.03em' }}
        >
          {formatCurrency(Math.round(net))}
        </p>
        <p className="m-0 mt-3 text-[13px] text-white/70">
          {perDay}/day × {formatCurrency(margin)} × 30 days, less {commission}% commission
        </p>
      </div>
    </div>
  );
}

export function SellLanding() {
  const router = useRouter();
  const { user } = useSelector((state: RootState) => state.auth);
  const heroRef = useRef<HTMLElement>(null);
  const [showBar, setShowBar] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let alive = true;
    void getApplicationsOpen().then((open) => {
      if (alive) setClosed(!open);
    });
    return () => {
      alive = false;
    };
  }, []);

  // The sticky CTA only appears once the hero's own form has scrolled away.
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setShowBar(!entry.isIntersecting), {
      threshold: 0.15,
    });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  const start = (shopName?: string) => {
    if (shopName) {
      try {
        sessionStorage.setItem(PENDING_SHOP_KEY, shopName);
      } catch {
        /* storage blocked — the form just starts empty */
      }
    }
    router.push(user ? '/seller' : '/auth/register?redirect=/seller');
  };

  const scrollToForm = () => {
    heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(
      () => document.getElementById('sell-shop-name')?.focus({ preventScroll: true }),
      400
    );
  };

  return (
    <main className="pb-24">
      {/* ── Landing header: logo + tagline, one link, one CTA ── */}
      <header className="sticky top-0 z-40 border-b border-line bg-white">
        <div className="container-fluid flex items-center justify-between gap-4 py-3 md:py-4">
          <Link
            href="/"
            className="flex min-w-0 flex-col no-underline"
            aria-label="Creative Impression home"
          >
            <span className="flex items-center gap-2 md:gap-2.5">
              <Image
                src="/images/IX%20Logo.JPG"
                alt=""
                width={44}
                height={44}
                className="h-8 w-8 flex-shrink-0 object-contain md:h-11 md:w-11"
                priority
              />
              <span
                className="truncate font-extrabold leading-none"
                style={{
                  color: 'var(--navy)',
                  fontSize: 'clamp(19px, 2.6vw, 32px)',
                  letterSpacing: '-0.035em',
                }}
              >
                Creative Impression
              </span>
            </span>
            <span
              className="mt-1 hidden text-[12px] sm:block md:text-[13px]"
              style={{ color: 'var(--ink-2)' }}
            >
              Open your apparel shop in{' '}
              <b className="font-semibold" style={{ color: 'var(--navy)' }}>
                minutes
              </b>
            </span>
          </Link>
          <nav className="flex flex-shrink-0 items-center gap-3 md:gap-6">
            <a
              href="#how-it-works"
              className="hidden text-[15px] font-medium no-underline sm:inline md:text-[17px]"
              style={{ color: 'var(--navy)' }}
            >
              How it works
            </a>
            <button
              type="button"
              onClick={scrollToForm}
              className="btn bg-brand-gradient px-4 font-semibold text-ink md:btn-lg md:px-6"
              style={{ borderRadius: 'var(--r-sm)', boxShadow: 'var(--shadow-brand)' }}
            >
              Start selling
            </button>
          </nav>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="relative scroll-mt-20 overflow-hidden bg-navy-glow text-white"
      >
        <div className="container-max relative grid items-start gap-10 py-12 lg:grid-cols-[1.25fr_1fr] lg:gap-16 lg:py-16">
          <div>
            <span
              className="inline-flex items-center gap-2 border border-white/20 bg-white/5 px-4 py-2 text-[13px] font-medium"
              style={{ borderRadius: 'var(--r-pill)' }}
            >
              <Icon name="sparkle" className="h-4 w-4 text-[var(--brand)]" />
              List your apparel next to our full catalogue
            </span>

            <h1
              className="m-0 mt-6 font-extrabold"
              style={{
                fontSize: 'clamp(32px, 5vw, 60px)',
                lineHeight: 1.04,
                letterSpacing: '-0.035em',
                textWrap: 'balance',
              }}
            >
              Start Your <span style={HIGHLIGHT}>Apparel Brand</span> with Your{' '}
              <span style={HIGHLIGHT}>Own Shop</span>, Our <span style={HIGHLIGHT}>Checkout</span>{' '}
              &amp; <span style={HIGHLIGHT}>Payouts</span>
            </h1>

            <p className="m-0 mt-6 max-w-[40ch] text-[17px] leading-relaxed text-white/85 md:text-[19px]">
              Get your own <u className="decoration-white/40 underline-offset-4">shop page</u>,{' '}
              <u className="decoration-white/40 underline-offset-4">secure payments</u> and an{' '}
              <u className="decoration-white/40 underline-offset-4">orders dashboard</u> — and start
              selling as soon as you&apos;re approved.
            </p>

            <button
              type="button"
              onClick={() =>
                document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth' })
              }
              className="mt-8 flex w-full max-w-[520px] items-center gap-4 border border-white/15 bg-white/5 p-4 text-left transition-colors hover:bg-white/10 md:p-5"
              style={{ borderRadius: 'var(--r-lg)' }}
            >
              <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-ink">
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 17l6-6 4 4 8-8" />
                  <path d="M15 7h6v6" />
                </svg>
              </span>
              <span className="text-[16px] font-semibold leading-snug md:text-[18px]">
                Sell 10 products/day at ₹250 margin →{' '}
                <span style={HIGHLIGHT}>{formatCurrency(75000)}/month</span> before commission.
              </span>
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <StartCard onStart={start} closed={closed} />
            <div className="grid grid-cols-2 gap-4">
              <a
                href="#calculator"
                className="flex items-center justify-center gap-2 bg-brand-gradient px-3 py-4 text-center text-[14px] font-semibold text-ink no-underline transition-shadow hover:shadow-[var(--shadow-brand)]"
                style={{ borderRadius: 'var(--r-md)' }}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  aria-hidden="true"
                >
                  <rect x="5" y="3" width="14" height="18" rx="2" />
                  <path d="M8 7h8M8 11h2M12 11h2M8 15h2M12 15h2M16 11v4" />
                </svg>
                Earnings Calculator
              </a>
              <a
                href="#how-it-works"
                className="flex flex-col items-center justify-center border border-white/25 px-3 py-3 text-center text-white no-underline transition-colors hover:bg-white/5"
                style={{ borderRadius: 'var(--r-md)' }}
              >
                <span className="text-[14px] font-semibold">How It Works</span>
                <span className="text-[12px] text-white/65">3 steps to your first order</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────── */}
      <section id="how-it-works" className="section-y scroll-mt-24">
        <div className="container-max">
          <h2 className="heading-rule m-0">How it works</h2>
          <ol className="mt-6 grid list-none gap-4 p-0 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="relative border border-line p-5"
                style={{ borderRadius: 'var(--r-lg)' }}
              >
                <span
                  className="absolute right-5 top-4 text-[32px] font-extrabold leading-none"
                  style={{ color: 'var(--border)' }}
                >
                  {index + 1}
                </span>
                <Icon name={step.icon} className="h-8 w-8 text-[var(--brand-600)]" />
                <p className="m-0 mt-4 text-[16px] font-semibold text-ink">{step.title}</p>
                <p
                  className="m-0 mt-1.5 text-[14px] leading-relaxed"
                  style={{ color: 'var(--ink-2)' }}
                >
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── What you get ─────────────────────────────────── */}
      <section className="section-y border-t border-line">
        <div className="container-max">
          <h2 className="heading-rule m-0">What you get</h2>
          <ul className="mt-6 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {PERKS.map((perk) => (
              <li
                key={perk.title}
                className="border border-line p-5"
                style={{ borderRadius: 'var(--r-lg)' }}
              >
                <span
                  className="flex h-10 w-10 items-center justify-center bg-[var(--brand-soft)] text-[var(--brand-700)]"
                  style={{ borderRadius: 'var(--r-sm)' }}
                >
                  <Icon name={perk.icon} className="h-5 w-5" />
                </span>
                <p className="m-0 mt-4 text-[15px] font-semibold text-ink">{perk.title}</p>
                <p
                  className="m-0 mt-1 text-[13px] leading-relaxed"
                  style={{ color: 'var(--ink-2)' }}
                >
                  {perk.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Calculator ───────────────────────────────────── */}
      <section id="calculator" className="section-y scroll-mt-24 border-t border-line">
        <div className="container-max">
          <h2 className="heading-rule m-0">Earnings calculator</h2>
          <p className="m-0 mb-6 mt-2 text-[14px]" style={{ color: 'var(--ink-2)' }}>
            Plug in your own numbers to see what a month could look like.
          </p>
          <EarningsCalculator />
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────── */}
      <section className="section-y border-t border-line">
        <div className="container-max text-center">
          <h2
            className="m-0 text-ink"
            style={{ fontSize: 'clamp(24px, 3vw, 34px)', letterSpacing: '-0.03em' }}
          >
            Ready to open your shop?
          </h2>
          <p className="mx-auto mt-2 max-w-[52ch] text-[15px]" style={{ color: 'var(--ink-2)' }}>
            Applying is free. Already selling with us?{' '}
            <Link href="/seller" className="font-semibold text-ink underline underline-offset-4">
              Go to your dashboard
            </Link>
            .
          </p>
          <button
            type="button"
            onClick={scrollToForm}
            className="btn btn-lg btn-primary mt-6 font-semibold"
            style={{ borderRadius: 'var(--r-sm)' }}
          >
            Start selling
          </button>
        </div>
      </section>

      {/* ── Sticky CTA bar ───────────────────────────────── */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 transition-all duration-300 ${
          showBar ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'
        }`}
        aria-hidden={!showBar}
      >
        <button
          type="button"
          onClick={scrollToForm}
          tabIndex={showBar ? 0 : -1}
          className="flex w-full max-w-[720px] items-center justify-center gap-3 bg-brand-gradient px-5 py-3.5 text-[15px] font-semibold text-ink md:text-[17px]"
          style={{ borderRadius: 'var(--r-md)', boxShadow: '0 12px 32px rgba(0,0,0,0.25)' }}
        >
          <Icon name="sparkle" className="h-5 w-5 flex-shrink-0" />
          <span>
            Open my shop on{' '}
            <span className="bg-white px-2 py-0.5" style={{ borderRadius: 'var(--r-sm)' }}>
              Creative Impression
            </span>
          </span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </main>
  );
}
