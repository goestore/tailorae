import React from 'react';
import type { HomeSectionId } from '@/config/home-sections';
import { selectCategoryTiles } from '@/config/home-categories';
import type { HomeContent } from '@/content/schema/home';
import { loadSectionProducts, toBestSellingCard } from '@/lib/home-products';
import { ProductCard, ViewAllTile } from '@/components/product';
import { ScrollRail } from '@/components/common';
import { CategoryCarousel } from './CategoryCarousel';
import { BestSellingSlider } from './BestSellingSlider';
import { DualPromoBanner } from './DualPromoBanner';
import { WhyChooseUs, OurServices, type CardItem } from './WhyChooseUs';
import { OrderCta } from './OrderCta';

/**
 * Home page sections, by id.
 *
 * `Record<HomeSectionId, …>` is the point: a section listed in
 * `config/home-sections.ts` with no renderer here is a type error, not a blank
 * space on the page at runtime.
 *
 * Each entry renders its complete band, wrapper and all, because a section
 * that can move has to carry its own spacing and rules with it — a separator
 * that belongs to the page rather than the section would end up in the wrong
 * place the moment anything is reordered.
 *
 * Every section takes the whole resolved namespace rather than its own slice.
 * The page composes sections without knowing what any of them needs, which is
 * what lets the order be data.
 */

export interface HomeSectionProps {
  content: HomeContent;
}

/** The rhythm every band shares, lifted from the page it was hardcoded in. */
const BAND = 'border-t border-line py-[var(--section-y)]';

const HomeHero: React.FC<HomeSectionProps> = ({ content }) => (
  <DualPromoBanner
    left={{
      image: content.hero.leftImage,
      alt: content.hero.leftAlt,
      // An empty link field means "not a link", so it must not become href="".
      href: content.hero.leftHref || undefined,
    }}
    right={{
      image: content.hero.rightImage,
      alt: content.hero.rightAlt,
      href: content.hero.rightHref || undefined,
    }}
    divider={1}
    aspectRatio="aspect-[3/2]"
  />
);

const Categories: React.FC<HomeSectionProps> = ({ content }) => (
  <div className={BAND}>
    <CategoryCarousel
      title={content.categories.heading}
      categories={selectCategoryTiles(content.categories.picks)}
    />
  </div>
);

/**
 * Best Selling.
 *
 * With products chosen it shows exactly those, in that order. With none it
 * keeps the hand-written cards the rail ships with, so the section is never
 * empty just because nobody has curated it yet.
 */
const BestSelling = async ({ content }: HomeSectionProps) => {
  const picks = content.bestSelling.picks;
  const products = picks.length > 0 ? await loadSectionProducts(picks, '') : [];

  return (
    <div className={BAND}>
      <BestSellingSlider
        title={content.bestSelling.heading}
        products={products.length > 0 ? products.map(toBestSellingCard) : undefined}
      />
    </div>
  );
};

/**
 * Featured Products.
 *
 * Falls back to whatever the catalog flags as featured, which is what this
 * section did before it could be curated.
 */
const Featured = async ({ content }: HomeSectionProps) => {
  const products = await loadSectionProducts(
    content.featured.picks,
    '/products?featured=true&limit=12'
  );

  // Still nothing to show: render no band at all rather than an empty one.
  if (products.length === 0) return null;

  return (
    <div className={BAND}>
      <section className="bg-white">
        <div className="container-max">
          <h2 className="heading-rule mb-4 md:mb-5">{content.featured.heading}</h2>

          <ScrollRail label="featured products">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} className="pcard-fixed snap-start" />
            ))}

            {/* Last slide, so the call to action sits where the row runs out. */}
            <ViewAllTile
              href="/products"
              label="View all products"
              className="pcard-fixed snap-start"
            />
          </ScrollRail>
        </div>
      </section>
    </div>
  );
};

/**
 * A stored list arrives as `Record<string, unknown>[]` — `resolveList` has
 * already forced every declared key to a valid value, so this narrows the type
 * without re-checking what the field validators just guaranteed.
 */
const toCards = (items: readonly Record<string, unknown>[]): CardItem[] =>
  items.map((item) => ({
    title: String(item.title ?? ''),
    description: String(item.description ?? ''),
    icon: String(item.icon ?? ''),
    href: typeof item.href === 'string' && item.href !== '' ? item.href : undefined,
  }));

const WhyChooseUsBand: React.FC<HomeSectionProps> = ({ content }) => (
  <WhyChooseUs heading={content.whyChooseUs.heading} items={toCards(content.whyChooseUs.items)} />
);

const ServicesBand: React.FC<HomeSectionProps> = ({ content }) => (
  <OurServices heading={content.services.heading} items={toCards(content.services.items)} />
);

const CtaBand: React.FC<HomeSectionProps> = ({ content }) => <OrderCta {...content.cta} />;

export const HOME_SECTION_COMPONENTS: Record<HomeSectionId, React.FC<HomeSectionProps>> = {
  hero: HomeHero,
  categories: Categories,
  'best-selling': BestSelling as React.FC<HomeSectionProps>,
  'why-choose-us': WhyChooseUsBand,
  'featured-products': Featured as React.FC<HomeSectionProps>,
  services: ServicesBand,
  cta: CtaBand,
};
