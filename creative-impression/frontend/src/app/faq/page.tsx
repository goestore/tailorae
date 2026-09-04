import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { InfoPage, FaqAccordion, type FaqItem } from '@/components/layout';

export const metadata: Metadata = {
  title: 'FAQ | Creative Impression',
  description:
    'Answers on sizing, shipping, returns, bulk orders and customization for Creative Impression.',
};

const faqs: FaqItem[] = [
  {
    q: 'How do I choose the right size?',
    a: 'Every product page links to the size guide, which lists garment measurements in inches. If you fall between two sizes, take the larger one for a relaxed fit — or send us your measurements before ordering and we will confirm.',
  },
  {
    q: 'Where do you ship?',
    a: 'We ship across India. Shipping is free on orders over ₹999; below that a flat ₹49 is added at checkout.',
  },
  {
    q: 'How long will delivery take?',
    a: 'Stock orders are processed within 24–48 hours and usually arrive 3–5 business days after dispatch. Customized and made-to-order pieces take 7–10 business days before dispatch.',
  },
  {
    q: 'Can I cancel my order?',
    a: 'Yes, from your account, as long as the order has not been dispatched. Once it ships, the return policy applies after delivery instead.',
  },
  {
    q: 'What is your return window?',
    a: 'Eligible items can be returned within 7 days of delivery. They must be unused, unwashed, undamaged, and returned with their original tags and packaging.',
  },
  {
    q: 'Are sale and customized items returnable?',
    a: 'Customized, altered and made-to-order pieces are not returnable, because they cannot be resold. Sale items are returnable only if they arrive damaged, defective, or incorrect.',
  },
  {
    q: 'How do refunds work?',
    a: 'Approved refunds are processed after a quality check. Prepaid orders are refunded to the original payment method; cash-on-delivery orders are refunded by bank transfer or store credit.',
  },
  {
    q: 'How do I track my order?',
    a: 'Use the Track Order page with your order number and the email you checked out with. Signed-in customers can also see every order under My Account.',
  },
  {
    q: 'Do you take bulk and wholesale orders?',
    a: 'Yes — that is a large part of what we do. Request a quote from the B2B page with your quantities, sizes and branding requirement, and we will come back with tiered pricing and a timeline.',
  },
  {
    q: 'Can you print or embroider our logo?',
    a: 'Yes. Upload your artwork on the customization page or send it with your bulk enquiry. We will confirm placement, colours and the print method that suits your fabric.',
  },
  {
    q: 'Will the colour match the photos exactly?',
    a: 'We photograph products carefully, but slight variation is normal — dye lots, fabric finish and screen calibration all shift how a colour reads.',
  },
];

// JSON.stringify does not escape `<`, and these answers are authored copy that
// goes into a script tag, so the three characters that could close it early are
// escaped by hand.
function ldJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\u003c')
    .replace(/>/g, '\u003e')
    .replace(/&/g, '\u0026');
}

export default function FaqPage() {
  // FAQPage markup is what lets these answers show up directly in a search
  // result. The questions were already written; only the machine-readable half
  // was missing.
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(faqLd) }} />
      <InfoPage title="Frequently asked questions" subtitle="Sizing, delivery, returns and bulk orders — answered.">
        <FaqAccordion items={faqs} />
        <div className="mt-10 border border-line bg-surface-2 p-6">
          <h2 className="m-0 text-ink" style={{ fontSize: '17px', fontWeight: 600 }}>
            Still need a hand?
          </h2>
          <p className="mt-2 text-[15px]" style={{ color: 'var(--ink-2)' }}>
            Send us the details and we will reply the same working day.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/info/contact" className="btn btn-primary">
              Contact us
            </Link>
            <Link href="/b2b" className="btn btn-outline">
              Request a bulk quote
            </Link>
          </div>
        </div>
      </InfoPage>
    </>
  );
}
