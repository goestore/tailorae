import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { InfoPage } from '@/components/layout';

export const metadata: Metadata = {
  title: 'Shipping & Delivery | Creative Impression',
  description:
    'Dispatch times, delivery windows, shipping charges and tracking for Creative Impression orders across India.',
};

export default function ShippingPage() {
  return (
    <InfoPage
      title="Shipping & delivery"
      subtitle="Where we ship, what it costs, and how long it takes."
      updated="September 2026"
      sections={[
        {
          title: 'Dispatch times',
          content: (
            <>
              <p className="m-0">
                In-stock orders are packed and handed to the courier within 24&ndash;48 working
                hours. Customized, printed, embroidered and made-to-order pieces are dispatched in
                7&ndash;10 working days, because production starts only after your artwork and size
                split are approved.
              </p>
              <p className="m-0">
                Bulk and wholesale runs are quoted with their own timeline at the time of the
                quote, and that timeline supersedes the one above.
              </p>
            </>
          ),
        },
        {
          title: 'Delivery windows',
          content: (
            <p className="m-0">
              Most metro addresses receive their parcel 3&ndash;5 working days after dispatch. Tier
              2 and 3 towns typically take 4&ndash;6, and the North East, Jammu &amp; Kashmir,
              Ladakh and the island territories take 6&ndash;9. You can check the estimate for your
              own pincode on any product page before you order.
            </p>
          ),
        },
        {
          title: 'Shipping charges',
          content: (
            <p className="m-0">
              Shipping is free on orders over &#8377;999. Below that a flat &#8377;49 is added at
              checkout. There are no other handling or packaging fees, and the price you see at the
              payment step is the final one.
            </p>
          ),
        },
        {
          title: 'Cash on delivery',
          content: (
            <p className="m-0">
              Cash on delivery is available across most of India. It is not offered on customized
              or made-to-order pieces, on bulk orders, or in a small number of pincodes the courier
              network does not cover for COD. The checkout pincode check tells you before you
              commit.
            </p>
          ),
        },
        {
          title: 'Tracking your order',
          content: (
            <p className="m-0">
              Once your parcel is picked up we send the courier name and tracking number by email.
              You can follow it from the{' '}
              <Link href="/track-order" className="underline underline-offset-2 hover:text-ink">
                Track Order
              </Link>{' '}
              page with your order number, or from{' '}
              <Link href="/dashboard" className="underline underline-offset-2 hover:text-ink">
                My Account
              </Link>{' '}
              if you were signed in when you ordered.
            </p>
          ),
        },
        {
          title: 'Undelivered and returned-to-origin parcels',
          content: (
            <p className="m-0">
              Couriers make three delivery attempts. If all three fail, or the address turns out to
              be incorrect or unreachable, the parcel comes back to us. We will contact you to
              arrange a re-dispatch; on prepaid orders you can instead ask for a refund, less the
              return freight actually incurred.
            </p>
          ),
        },
        {
          title: 'International orders',
          content: (
            <p className="m-0">
              We currently ship retail orders within India only. We do export in bulk &mdash; if
              you are ordering for a business outside India, start with a{' '}
              <Link href="/b2b" className="underline underline-offset-2 hover:text-ink">
                bulk enquiry
              </Link>{' '}
              and we will quote freight and duties with the order.
            </p>
          ),
        },
      ]}
    >
      <div className="border border-line bg-surface-2 p-6">
        <p className="m-0 text-[15px]" style={{ color: 'var(--ink-2)' }}>
          Returns and refunds are covered separately in the{' '}
          <Link href="/return-policy" className="underline underline-offset-2 hover:text-ink">
            return policy
          </Link>{' '}
          and{' '}
          <Link href="/refund-policy" className="underline underline-offset-2 hover:text-ink">
            refund policy
          </Link>
          .
        </p>
      </div>
    </InfoPage>
  );
}
