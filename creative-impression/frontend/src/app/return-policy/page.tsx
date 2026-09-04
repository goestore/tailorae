import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { InfoPage } from '@/components/layout';

export const metadata: Metadata = {
  title: 'Return Policy | Creative Impression',
  description:
    'Our 7-day return window: what is eligible, what is not, and how to raise a return request.',
};

export default function ReturnPolicyPage() {
  return (
    <InfoPage
      title="Return policy"
      subtitle="Seven days from delivery, on everything we did not make to order."
      updated="September 2026"
      sections={[
        {
          title: 'The window',
          content: (
            <p className="m-0">
              You can raise a return within <strong className="text-ink">7 days</strong> of
              delivery. Requests raised after that cannot be accepted, because the courier pickup
              window and our quality check both close at that point.
            </p>
          ),
        },
        {
          title: 'What makes an item eligible',
          content: (
            <ul className="m-0 list-disc space-y-2 pl-5">
              <li>Unused, unwashed and undamaged</li>
              <li>All original tags, labels and packaging still attached</li>
              <li>Accessories, belts, and any free items shipped with it are included</li>
              <li>The invoice or order number is quoted with the request</li>
            </ul>
          ),
        },
        {
          title: 'Reasons we accept',
          content: (
            <ul className="m-0 list-disc space-y-2 pl-5">
              <li>Damaged or defective on arrival</li>
              <li>Wrong item, colour or size delivered</li>
              <li>Materially different from the product description or photographs</li>
              <li>Fit or size concern, on stock items only</li>
            </ul>
          ),
        },
        {
          title: 'What we cannot take back',
          content: (
            <>
              <ul className="m-0 list-disc space-y-2 pl-5">
                <li>
                  Customized, printed, embroidered, altered and made-to-order pieces &mdash; they
                  carry your artwork or your measurements and cannot be resold
                </li>
                <li>Bulk and wholesale orders, unless the goods are defective</li>
                <li>Final-sale items, unless damaged, defective or incorrect</li>
                <li>Anything worn, washed, perfumed, stained or damaged after delivery</li>
                <li>Innerwear and any item sold as non-returnable on its product page</li>
              </ul>
              <p className="m-0">
                Where an item is excluded, the product page says so before you add it to the cart.
              </p>
            </>
          ),
        },
        {
          title: 'How to raise a return',
          content: (
            <ol className="m-0 list-decimal space-y-2 pl-5">
              <li>
                Open the order under{' '}
                <Link href="/dashboard" className="underline underline-offset-2 hover:text-ink">
                  My Account
                </Link>{' '}
                and choose Request a return.
              </li>
              <li>Tell us the reason, and attach photographs if the item is damaged or wrong.</li>
              <li>
                We review the request within one working day and send pickup or return-shipping
                instructions.
              </li>
              <li>Pack the item with its tags and packaging and hand it to the courier.</li>
            </ol>
          ),
        },
        {
          title: 'Quality check',
          content: (
            <p className="m-0">
              Every returned parcel is inspected when it reaches us. Refunds and exchanges are
              processed only after the item passes that check. If it fails, we will send it back to
              you and explain why.
            </p>
          ),
        },
        {
          title: 'Exchanges',
          content: (
            <p className="m-0">
              Size exchanges on stock items are free once per order, subject to the replacement size
              being available. If it is not, we process a refund instead.
            </p>
          ),
        },
      ]}
    >
      <div className="border border-line bg-surface-2 p-6">
        <p className="m-0 text-[15px]" style={{ color: 'var(--ink-2)' }}>
          How the money comes back is covered in the{' '}
          <Link href="/refund-policy" className="underline underline-offset-2 hover:text-ink">
            refund policy
          </Link>
          .
        </p>
      </div>
    </InfoPage>
  );
}
