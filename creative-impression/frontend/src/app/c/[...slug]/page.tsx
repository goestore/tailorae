import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryListing } from '@/components/product/CategoryListing';
import type { Crumb, ListingChip } from '@/components/product/ProductListing';
import type { CatalogSection } from '@/config/catalog';
import {
  storeHref,
  fetchCategoryTree,
  findCategoryByPath,
  type StoreCategory,
} from '@/lib/category-tree';

/**
 * Any category's page, at /c/<department>/<subcategory>/…
 *
 * Women / Men / Kids and their subcategories are canonically served at
 * /products/<dept>/… (links here point there), but resolve here too. This
 * is the page every other category gets — Footwear, Electronics, or one the
 * admin creates tomorrow — with no code change: the path is resolved against
 * the live category tree, and the listing is the shared CategoryListing,
 * scoped by the category's slug (which the API widens to its subcategories).
 */

interface Params {
  params: Promise<{ slug: string[] }>;
}

async function resolve(slugs: string[]) {
  const tree = await fetchCategoryTree();
  return tree ? findCategoryByPath(tree, slugs.map((s) => decodeURIComponent(s))) : null;
}

const describe = (category: StoreCategory) =>
  category.description?.trim() || `Shop ${category.name} at Creative Impression.`;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const found = await resolve(slug);
  if (!found) return {};
  return {
    title: `${found.category.name} | Creative Impression`,
    description: describe(found.category),
  };
}

export default async function CategoryPage({ params }: Params) {
  const { slug } = await params;
  const found = await resolve(slug);
  if (!found) notFound();
  const { category, ancestors } = found;

  const section: CatalogSection = {
    slug: category.slug,
    title: category.name,
    description: describe(category),
    query: { category: category.slug },
  };

  const crumbs: Crumb[] = [
    { label: 'Home', href: '/' },
    ...ancestors.map((a) => ({ label: a.name, href: storeHref(a) })),
    { label: category.name },
  ];

  // A department shows its subcategories; a subcategory shows its siblings,
  // with "All <parent>" leading back up. One entry is always the current one.
  const parent = ancestors[ancestors.length - 1];
  const strip = category.children.length ? category : parent;
  const chips: ListingChip[] =
    strip && strip.children.length
      ? [
          { label: `All ${strip.name}`, href: storeHref(strip), active: strip.id === category.id },
          ...strip.children.map((child) => ({
            label: child.name,
            href: storeHref(child),
            active: child.id === category.id,
          })),
        ]
      : [];

  return <CategoryListing section={section} crumbs={crumbs} chips={chips} />;
}
