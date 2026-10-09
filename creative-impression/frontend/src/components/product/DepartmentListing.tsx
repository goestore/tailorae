import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryListing } from './CategoryListing';
import type { Crumb, ListingChip } from './ProductListing';
import type { CatalogSection } from '@/config/catalog';
import {
  fetchCategoryTree,
  findStoreCategory,
  storeHref,
  type StoreCategory,
} from '@/lib/category-tree';

/**
 * The Women / Men / Kids pages: /products/<dept> and /products/<dept>/<sub>.
 *
 * Both resolve against the live category tree — the subcategory can sit at any
 * depth (Kids › Girls › Dresses is /products/kids/dresses) — and list the
 * category's products, its subcategories included. Sibling chips are the
 * category's own children, or its siblings when it has none.
 *
 * With the API unreachable the page still renders: the department, or the
 * subcategory its URL most likely names, listed without chips.
 */

const titleCase = (value: string) =>
  value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const describe = (category: StoreCategory) =>
  category.description?.trim() || `Shop ${category.name} at Creative Impression.`;

async function resolve(dept: string, sub?: string) {
  const tree = await fetchCategoryTree();
  if (!tree) return { tree: null, found: null };
  return { tree, found: findStoreCategory(tree, dept, sub && decodeURIComponent(sub)) };
}

export async function departmentMetadata(dept: string, sub?: string): Promise<Metadata> {
  const { found } = await resolve(dept, sub);
  if (!found) return {};
  const { category, ancestors } = found;
  const root = ancestors[0];
  return {
    title: `${category.name}${root ? ` – ${root.name}` : ''} | Creative Impression`,
    description: describe(category),
  };
}

export async function DepartmentListing({ dept, sub }: { dept: string; sub?: string }) {
  const { tree, found } = await resolve(dept, sub);

  if (!tree) {
    // No tree to resolve against: list the slug the URL most likely names.
    const slug = sub ? `${dept}-${sub}` : dept;
    const section: CatalogSection = {
      slug,
      title: titleCase(sub ?? dept),
      description: '',
      query: { category: slug },
    };
    return <CategoryListing section={section} />;
  }
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
    { label: 'Products', href: '/products' },
    ...ancestors.map((a) => ({ label: a.name, href: storeHref(a) })),
    { label: category.name },
  ];

  // A category with subcategories shows them; a leaf shows its siblings, with
  // "All <parent>" leading back up. Exactly one chip is the current page.
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
