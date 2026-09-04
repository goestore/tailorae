import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { InfoPage } from '@/components/layout';

export const metadata: Metadata = {
  title: 'Terms of Service | Creative Impression',
  description:
    'The terms that apply when you browse, order, or place a bulk enquiry with Creative Impression.',
};

export default function TermsPage() {
  return (
    <InfoPage
      title="Terms of service"
      subtitle="The agreement between you and us when you shop or order."
      updated="September 2026"
      sections={[
        {
          title: 'Accepting these terms',
          content: (
            <p className="m-0">
              Browsing the store or placing an order means you accept these terms. We update them
              from time to time; the version in force is the one published here on the day you
              order.
            </p>
          ),
        },
        {
          title: 'Accounts',
          content: (
            <p className="m-0">
              You are responsible for keeping your login details private and for activity under
              your account. Tell us straight away if you think someone else has access. We may
              suspend an account used for fraud, abuse, or repeated payment failures.
            </p>
          ),
        },
        {
          title: 'Products and accuracy',
          content: (
            <p className="m-0">
              We photograph and describe products as accurately as we can. Colour, texture and
              handfeel still vary between dye lots and between screens, and measurements carry a
              normal manufacturing tolerance of about half an inch. That variation is not a defect.
            </p>
          ),
        },
        {
          title: 'Pricing and payment',
          content: (
            <p className="m-0">
              All prices are in Indian Rupees and include GST unless stated otherwise. Payment is
              taken before dispatch, except on cash-on-delivery orders. If a price or stock level is
              published in error, we may cancel the affected order and refund it in full rather
              than honour a mistake.
            </p>
          ),
        },
        {
          title: 'Order acceptance',
          content: (
            <p className="m-0">
              Your order is an offer to buy. It is accepted when we confirm dispatch. Until then we
              may decline it &mdash; for stock, payment, delivery-area or fraud-screening reasons
              &mdash; and refund anything already paid.
            </p>
          ),
        },
        {
          title: 'Customization and artwork',
          content: (
            <p className="m-0">
              When you send artwork for printing or embroidery, you confirm you own it or have
              permission to use it, and that it does not infringe anyone else. We may decline work
              that appears infringing, unlawful or hateful. Production starts from the proof you
              approve, so approved proofs cannot be changed afterwards and customized goods are not
              returnable.
            </p>
          ),
        },
        {
          title: 'Bulk and B2B orders',
          content: (
            <p className="m-0">
              Bulk quotes are valid for the period stated on the quote and are subject to a
              confirmed size split and artwork. Production timelines run from the date the advance
              and the approved proof are both received. Bulk terms in a signed quote or purchase
              order override the general terms here.
            </p>
          ),
        },
        {
          title: 'Delivery, returns and refunds',
          content: (
            <p className="m-0">
              Delivery is covered in the{' '}
              <Link href="/shipping" className="underline underline-offset-2 hover:text-ink">
                shipping policy
              </Link>
              , and returns and refunds in the{' '}
              <Link href="/return-policy" className="underline underline-offset-2 hover:text-ink">
                return
              </Link>{' '}
              and{' '}
              <Link href="/refund-policy" className="underline underline-offset-2 hover:text-ink">
                refund
              </Link>{' '}
              policies. Those pages form part of these terms.
            </p>
          ),
        },
        {
          title: 'Intellectual property',
          content: (
            <p className="m-0">
              The site, its photography, copy and designs belong to us or our licensors. You may
              not copy, scrape or republish them commercially without written permission. Your own
              artwork stays yours.
            </p>
          ),
        },
        {
          title: 'Liability',
          content: (
            <p className="m-0">
              We are liable for what the law does not let us exclude, including death or personal
              injury caused by negligence and any liability for fraud. Beyond that, our total
              liability for a claim is limited to the amount you paid for the order it concerns,
              and we are not liable for indirect or consequential loss such as lost profit or lost
              business.
            </p>
          ),
        },
        {
          title: 'Governing law',
          content: (
            <p className="m-0">
              These terms are governed by the laws of India, and the courts of India have exclusive
              jurisdiction over disputes arising from them.
            </p>
          ),
        },
      ]}
    />
  );
}
