import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { InfoPage } from '@/components/layout';

export const metadata: Metadata = {
  title: 'Privacy Policy | Creative Impression',
  description:
    'What information Creative Impression collects, how it is used and shared, and the choices you have over it.',
};

export default function PrivacyPage() {
  return (
    <InfoPage
      title="Privacy policy"
      subtitle="What we collect, why, and what you can ask us to do about it."
      updated="September 2026"
      sections={[
        {
          title: 'What we collect',
          content: (
            <>
              <p className="m-0">
                We collect what you give us and what the site needs to work:
              </p>
              <ul className="m-0 list-disc space-y-2 pl-5">
                <li>
                  <strong className="text-ink">Account and order data</strong> &mdash; name, email,
                  phone, billing and delivery addresses, order history, and GST number on business
                  orders.
                </li>
                <li>
                  <strong className="text-ink">Content you upload</strong> &mdash; artwork, logos
                  and design files submitted for customization or a bulk quote.
                </li>
                <li>
                  <strong className="text-ink">Support history</strong> &mdash; enquiries, return
                  requests and the messages exchanged about them.
                </li>
                <li>
                  <strong className="text-ink">Technical data</strong> &mdash; device, browser, IP
                  address and pages viewed, used to keep the site secure and working.
                </li>
              </ul>
            </>
          ),
        },
        {
          title: 'How we use it',
          content: (
            <p className="m-0">
              To process and deliver orders, produce customized work, handle returns and refunds,
              answer support requests, prevent fraud and abuse, meet tax and accounting
              obligations, improve the site, and send marketing only where you have opted in.
            </p>
          ),
        },
        {
          title: 'Payments',
          content: (
            <p className="m-0">
              Card, UPI and net-banking details are collected and processed by our payment
              partners on their own systems. We never see or store full card numbers, UPI PINs or
              banking credentials &mdash; we receive only the result of the transaction and a
              reference for it.
            </p>
          ),
        },
        {
          title: 'Your artwork',
          content: (
            <p className="m-0">
              Designs, logos and files you upload are used to produce your order and nothing else.
              We do not resell them, add them to our catalogue, or use them in marketing without
              asking you first.
            </p>
          ),
        },
        {
          title: 'Who we share it with',
          content: (
            <p className="m-0">
              Only the parties needed to complete what you asked for: payment gateways, courier and
              logistics partners, email and messaging providers, and the technology vendors that
              host and secure the site. Each receives the minimum they need. We also disclose
              information where the law requires it. We do not sell personal data.
            </p>
          ),
        },
        {
          title: 'How long we keep it',
          content: (
            <p className="m-0">
              Order, invoice and tax records are kept for as long as Indian tax law requires.
              Account details are kept while your account is open. Marketing consent is kept until
              you withdraw it. Uploaded artwork is kept while the order is live and for a
              reasonable reorder window after it.
            </p>
          ),
        },
        {
          title: 'Your choices',
          content: (
            <p className="m-0">
              You can ask us to show you what we hold, correct it, or delete it where we are not
              required to keep it. Every marketing email carries an unsubscribe link, and cookies
              can be limited in your browser settings &mdash; see the{' '}
              <Link href="/cookies-policy" className="underline underline-offset-2 hover:text-ink">
                cookies policy
              </Link>
              .
            </p>
          ),
        },
        {
          title: 'Security',
          content: (
            <p className="m-0">
              Traffic is encrypted in transit, passwords are stored hashed rather than in readable
              form, and access to customer data is limited to the people who need it. No system is
              perfectly secure, so if a breach ever affects your data we will tell you.
            </p>
          ),
        },
        {
          title: 'Children',
          content: (
            <p className="m-0">
              The store is not intended for children under 18. We sell kidswear to adults buying
              for children, and we do not knowingly collect data directly from a child.
            </p>
          ),
        },
        {
          title: 'Contact',
          content: (
            <p className="m-0">
              Privacy requests and questions go through the{' '}
              <Link href="/info/contact" className="underline underline-offset-2 hover:text-ink">
                contact page
              </Link>
              . We answer within 30 days.
            </p>
          ),
        },
      ]}
    />
  );
}
