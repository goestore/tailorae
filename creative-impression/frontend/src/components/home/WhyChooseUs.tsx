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

const CARD = 'flex h-full flex-col p-5 text-center';

/** h-full + flex keeps every card the same height regardless of copy length. */
const CardBody: React.FC<{ item: CardItem }> = ({ item }) => (
  <Card hover className={CARD}>
    <div className="mb-4 flex h-12 items-center justify-center">
      <Icon name={item.icon} className="h-8 w-8 text-ink" />
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
        <h2 className="heading-rule heading-rule-center mb-4 md:mb-6">{heading}</h2>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, index) =>
            item.href ? (
              // The index is part of the key because two cards may legitimately
              // share a title while someone is still editing them.
              <Link key={`${item.title}-${index}`} href={item.href} className="block h-full">
                <CardBody item={item} />
              </Link>
            ) : (
              <div key={`${item.title}-${index}`}>
                <CardBody item={item} />
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
