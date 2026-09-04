import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { InfoPage } from '@/components/layout';

export const metadata: Metadata = {
  title: 'Cookies Policy | Creative Impression',
  description:
    'The cookies and similar technologies this site uses, what each one does, and how to control them.',
};

export default function CookiesPolicyPage() {
  return (
    <InfoPage
      title="Cookies policy"
      subtitle="Small files that keep you signed in and your cart intact."
      updated="September 2026"
      sections={[
        {
          title: 'What cookies are',
          content: (
            <p className="m-0">
              Cookies are small files a site stores on your device so it can recognise the same
              browser on the next request. We also use similar browser storage, which works the
              same way and is covered by this policy.
            </p>
          ),
        },
        {
          title: 'Strictly necessary',
          content: (
            <p className="m-0">
              These keep you signed in, hold your cart and checkout progress between pages, and
              protect forms against cross-site request forgery. The store cannot function without
              them, so they are always on. Blocking them breaks login, cart and checkout.
            </p>
          ),
        },
        {
          title: 'Preference',
          content: (
            <p className="m-0">
              These remember choices you have made &mdash; recently viewed products, a dismissed
              banner, the size or colour you last selected. Losing them is a small inconvenience,
              not a broken site.
            </p>
          ),
        },
        {
          title: 'Analytics',
          content: (
            <p className="m-0">
              These tell us which pages are used, where people drop out of checkout, and what is
              slow. We read them in aggregate to improve the store, not to identify you personally.
            </p>
          ),
        },
        {
          title: 'Marketing',
          content: (
            <p className="m-0">
              If and when we run advertising, these measure whether a campaign led to a purchase
              and avoid showing you the same advert repeatedly. They are only set where you have
              consented.
            </p>
          ),
        },
        {
          title: 'Third parties',
          content: (
            <p className="m-0">
              Our payment gateway and courier partners may set their own cookies on their own pages
              when you are handed over to them. Those are governed by their policies, not this one.
            </p>
          ),
        },
        {
          title: 'Managing cookies',
          content: (
            <p className="m-0">
              Every major browser lets you view, block and delete cookies in its settings, and
              private or incognito windows discard them when closed. Blocking the strictly
              necessary ones will stop cart, login, checkout and order tracking from working.
            </p>
          ),
        },
        {
          title: 'More detail',
          content: (
            <p className="m-0">
              What we do with the data behind these cookies is set out in the{' '}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
                privacy policy
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
