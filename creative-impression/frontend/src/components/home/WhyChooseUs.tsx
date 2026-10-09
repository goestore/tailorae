import Link from 'next/link';
import { Card, Icon } from '@/components/common';

/**
 * The two card bands — "Why Choose Creative Impression?" and "Our Services".
 *
 * Both render the same object: a grid of icon/title/description cards, one of
 * them linked. They take their cards as data because the admin edits, reorders
 * and removes them; the markup is exactly what the page shipped with.
 *
 * An empty list renders no band at all. A heading with nothing under it is
 * worse than a section that is simply not there, and removing every card is a
 * legitimate way to turn a band off.
 */

export interface CardItem {
  title: string;
  description: string;
  icon: string;
  /** Present on service cards, absent on value-prop cards. */
  href?: string;
}

const CARD = 'flex h-full flex-col p-5 text-left';

/**
 * Each icon gets the colour of what it stands for (delivery blue, pricing
 * green…). Icons not listed — an admin can pick any — cycle through the same
 * palette, so a card is never left uncoloured.
 */
const TONE_BY_ICON: Record<string, string> = {
  sparkle: 'gold',
  star: 'gold',
  truck: 'blue',
  tag: 'green',
  sewing: 'violet',
  printer: 'coral',
  building: 'indigo',
  tshirt: 'rose',
  palette: 'teal',
};
const TONES = ['gold', 'blue', 'green', 'violet', 'coral', 'indigo', 'rose', 'teal'];
const toneFor = (icon: string, index: number) => TONE_BY_ICON[icon] ?? TONES[index % TONES.length];

/** h-full + flex keeps every card the same height regardless of copy length. */
const CardBody: React.FC<{ item: CardItem; index: number }> = ({ item, index }) => (
  <Card hover className={CARD}>
    <div
      className={`service-icon service-icon--${index % 6} service-tone--${toneFor(item.icon, index)} mb-4 flex items-center justify-center`}
    >
      <Icon name={item.icon} className="h-5 w-5" />
    </div>
    <h3 className="mb-1.5 text-[15px] font-semibold text-ink">{item.title}</h3>
    <p className="text-sm leading-relaxed text-ink-3">{item.description}</p>
  </Card>
);

interface CardBandProps {
  heading: string;
  items: readonly CardItem[];
}

const CardBand: React.FC<CardBandProps> = ({ heading, items }) => {
  if (items.length === 0) return null;

  return (
    <section className="section-y border-t border-line bg-white">
      <div className="container-max">
        <div className="section-head">
          <h2 className="heading-rule">{heading}</h2>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, index) =>
            item.href ? (
              // The index is part of the key because two cards may legitimately
              // share a title while someone is still editing them.
              <Link key={`${item.title}-${index}`} href={item.href} className="block h-full">
                <CardBody item={item} index={index} />
              </Link>
            ) : (
              <div key={`${item.title}-${index}`}>
                <CardBody item={item} index={index} />
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
};

export const WhyChooseUs: React.FC<CardBandProps> = CardBand;
export const OurServices: React.FC<CardBandProps> = CardBand;
