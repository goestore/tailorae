import React from 'react';
import type { HomeSectionId } from '@/config/home-sections';
import { tilesFromCategories } from '@/config/home-categories';
import { fetchHomeCategories } from '@/lib/category-tree';
import type { HomeContent } from '@/content/schema/home';
import type { Product } from '@/types';
import { loadSectionProducts } from '@/lib/home-products';
import { ProductCard, ViewAllTile } from '@/components/product';
import { ScrollRail } from '@/components/common';
import { CategoryCarousel } from './CategoryCarousel';
import { HeroBanner } from './HeroBanner';
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

/**
 * A titled rail of product cards ending in a "view all" tile — the shape both
 * Best Selling and Featured take, with the same card the catalogue uses.
 */
const ProductRail: React.FC<{
  heading: string;
  label: string;
  products: Product[];
  viewAllHref: string;
  viewAllLabel: string;
}> = ({ heading, label, products, viewAllHref, viewAllLabel }) => (
  <div className={BAND}>
    <section className="bg-white">
      <div className="container-max">
        <div className="section-head">
          <h2 className="heading-rule">{heading}</h2>
        </div>

        <ScrollRail label={label}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} className="pcard-fixed snap-start" />
          ))}

          {/* Last slide, so the call to action sits where the row runs out. */}
          <ViewAllTile href={viewAllHref} label={viewAllLabel} className="pcard-fixed snap-start" />
        </ScrollRail>
      </div>
    </section>
  </div>
);

const HomeHero: React.FC<HomeSectionProps> = ({ content }) => (
  <HeroBanner
    layout={content.hero.layout}
    left={{
      image: content.hero.leftImage,
      alt: content.hero.leftAlt,
      // An empty link field means "not a link", so it must not become href="".
      href: content.hero.leftHref || undefined,
      eyebrow: content.hero.leftEyebrow || undefined,
      heading: content.hero.leftHeading || undefined,
      cta: content.hero.leftCta || undefined,
    }}
    right={{
      image: content.hero.rightImage,
      alt: content.hero.rightAlt,
      href: content.hero.rightHref || undefined,
      eyebrow: content.hero.rightEyebrow || undefined,
      heading: content.hero.rightHeading || undefined,
      cta: content.hero.rightCta || undefined,
    }}
    divider={1}
    className="home-hero"
    aspectRatio="aspect-[4/5] md:aspect-[3/2]"
  />
);

/**
 * Explore all categories: the categories marked "Show on homepage" in the
 * admin, in their homepage order. No band at all while there are none, or
 * while the API is unreachable.
 */
const Categories = async ({ content }: HomeSectionProps) => {
  const live = await fetchHomeCategories();
  if (!live || live.length === 0) return null;
  return (
    <div className={BAND}>
      <CategoryCarousel
        title={content.categories.heading}
        categories={tilesFromCategories(live)}
      />
    </div>
  );
};

/**
 * Best Selling.
 *
 * With products chosen it shows exactly those, in that order. With none it
 * keeps the hand-written cards the rail ships with, so the section is never
 * empty just because nobody has curated it yet.
 */
const BestSelling = async ({ content }: HomeSectionProps) => {
  const picks = content.bestSelling.picks;
  // Fall back to what is actually selling rather than to nothing: an
  // uncurated homepage should still show real stock.
  const products = await loadSectionProducts(picks, '/products?sortBy=popular&limit=12');

  /**
   * Render no band at all when there is nothing real to put in it.
   *
   * Passing `undefined` here used to hand the slider its built-in
   * `DEFAULT_PRODUCTS` — eight invented garments with invented prices and
   * invented discounts, on the homepage, linking to category pages. A shop
   * that advertises stock it does not have is worse than a shop with one
   * section fewer, and the Featured band below already gets this right.
   */
  if (products.length === 0) return null;

  return (
    <ProductRail
      heading={content.bestSelling.heading}
      label="best selling"
      products={products}
      viewAllHref="/products?sortBy=popular"
      viewAllLabel="View all best sellers"
    />
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
    <ProductRail
      heading={content.featured.heading}
      label="featured products"
      products={products}
      viewAllHref="/products"
      viewAllLabel="View all products"
    />
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
  categories: Categories as React.FC<HomeSectionProps>,
  'best-selling': BestSelling as React.FC<HomeSectionProps>,
  'why-choose-us': WhyChooseUsBand,
  'featured-products': Featured as React.FC<HomeSectionProps>,
  services: ServicesBand,
  cta: CtaBand,
};
