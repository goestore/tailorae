import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { InfoPage } from '@/components/layout';

export const metadata: Metadata = {
  title: 'Refund Policy | Creative Impression',
  description:
    'Refund eligibility, timelines, deductions and how money is returned for prepaid and cash-on-delivery orders.',
};

export default function RefundPolicyPage() {
  return (
    <InfoPage
      title="Refund policy"
      subtitle="What comes back, to where, and how long it takes."
      updated="September 2026"
      sections={[
        {
          title: 'Eligibility',
          content: (
            <p className="m-0">
              Refunds are issued for returns approved under the{' '}
              <Link href="/return-policy" className="underline underline-offset-2 hover:text-ink">
                7-day return policy
              </Link>
              , and for orders cancelled before dispatch. The item must pass our quality check
              before a refund is initiated.
            </p>
          ),
        },
        {
          title: 'Timeline',
          content: (
            <p className="m-0">
              We initiate approved refunds within{' '}
              <strong className="text-ink">5&ndash;7 working days</strong> of the returned item
              clearing quality check. Your bank or card issuer then takes its own time to post the
              credit &mdash; usually 2&ndash;5 working days, occasionally a full billing cycle.
            </p>
          ),
        },
        {
          title: 'Where the money goes',
          content: (
            <p className="m-0">
              Prepaid orders are refunded to the original payment method. There is no way to send
              them anywhere else, and we will never ask you for card or account details to process
              one. Cash-on-delivery orders are refunded by bank transfer or UPI to an account you
              nominate, or as store credit if you prefer.
            </p>
          ),
        },
        {
          title: 'Cancellations before dispatch',
          content: (
            <p className="m-0">
              An order cancelled before it ships is refunded in full, including shipping. Once
              production has started on a customized or made-to-order piece, it can no longer be
              cancelled.
            </p>
          ),
        },
        {
          title: 'Deductions',
          content: (
            <p className="m-0">
              When a return is our fault &mdash; damaged, defective, or the wrong item &mdash;
              nothing is deducted and we cover the return freight. On a change-of-mind or fit
              return, the original shipping charge and the reverse pickup charge are not refunded.
              Coupon discounts are recalculated: if a return takes the order below the minimum the
              coupon required, that discount is reversed against the refunded amount.
            </p>
          ),
        },
        {
          title: 'Not refundable',
          content: (
            <ul className="m-0 list-disc space-y-2 pl-5">
              <li>Customized, printed, embroidered and made-to-order pieces</li>
              <li>Items returned after the 7-day window</li>
              <li>Items that fail quality check &mdash; worn, washed, altered or missing tags</li>
              <li>Store credit and promotional benefits already redeemed</li>
            </ul>
          ),
        },
        {
          title: 'Partial returns',
          content: (
            <p className="m-0">
              On a multi-item order you can return part of it. We refund the returned lines at the
              price actually paid for them after any discount was distributed, and the rest of the
              order stands.
            </p>
          ),
        },
      ]}
    >
      <div className="border border-line bg-surface-2 p-6">
        <p className="m-0 text-[15px]" style={{ color: 'var(--ink-2)' }}>
          A refund that has not arrived after the window above is worth chasing &mdash; send us your
          order number from the{' '}
          <Link href="/info/contact" className="underline underline-offset-2 hover:text-ink">
            contact page
          </Link>{' '}
          and we will trace it with the payment provider.
        </p>
      </div>
    </InfoPage>
  );
}
