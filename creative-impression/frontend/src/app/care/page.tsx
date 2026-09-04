import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { InfoPage } from '@/components/layout';

export const metadata: Metadata = {
  title: 'Care Guide | Creative Impression',
  description:
    'How to wash, dry, iron and store your garments — including printed and embroidered pieces.',
};

const CARE_SECTIONS = [
  {
    title: 'Before the first wash',
    body: 'Wash new colours separately the first two or three times. Deep dyes — indigo, red, black — release surplus dye early on, and one wash with a light garment is how that becomes permanent.',
  },
  {
    title: 'Washing',
    body: 'Cold water, mild detergent, gentle cycle, garment turned inside out. Skip the bleach and the fabric softener: bleach strips dye and softener coats fibres so cotton stops absorbing sweat. Structured pieces, blends and anything labelled dry-clean should go to a cleaner rather than a machine.',
  },
  {
    title: 'Printed and embroidered pieces',
    body: 'Always turn the garment inside out before washing and never iron directly onto a print or over embroidery. Machine-wash cold on a gentle cycle, and keep printed items out of the dryer entirely — heat is what cracks a print.',
  },
  {
    title: 'Drying',
    body: 'Do not wring or twist. Reshape the garment while damp and dry it flat, or on a line in the shade. Direct sun bleaches colour out of the shoulders first, which is why a favourite shirt fades unevenly.',
  },
  {
    title: 'Ironing',
    body: 'Low to medium heat, on the reverse side. Use a press cloth over prints, embroidery and any delicate weave. Steam is safer than a hot dry plate on synthetics and blends.',
  },
  {
    title: 'Storage',
    body: 'Cool, dry and dark. Hang tailored and structured pieces on padded or broad hangers so the shoulders keep their line; fold knitwear instead, because hanging stretches it out. Use breathable cotton covers rather than plastic, which traps moisture.',
  },
  {
    title: 'Stains',
    body: 'Blot, never rub, and treat it while it is fresh. Cold water for protein stains such as blood or dairy; a little detergent worked in gently for oil. Heat sets a stain permanently, so do not put a stained garment through a dryer or an iron until it is gone.',
  },
];

export default function CarePage() {
  return (
    <InfoPage
      title="Care guide"
      subtitle="Fabric lasts as long as it is looked after. Here is how ours does."
      sections={CARE_SECTIONS.map((section) => ({
        title: section.title,
        content: <p className="m-0">{section.body}</p>,
      }))}
    >
      <div className="border border-line bg-surface-2 p-6">
        <p className="m-0 text-[15px]" style={{ color: 'var(--ink-2)' }}>
          Where a garment carries its own care label, that label wins &mdash; it is written for that
          exact fabric. Not sure about a piece you have bought from us? Ask on the{' '}
          <Link href="/info/contact" className="underline underline-offset-2 hover:text-ink">
            contact page
          </Link>{' '}
          with your order number and we will tell you how it was made.
        </p>
      </div>
    </InfoPage>
  );
}
