import React, { Suspense } from 'react';
import { ProductGrid } from './ProductGrid';
import { CatalogSection } from '@/config/catalog';
import { Product } from '@/types';
import { ProductListing, Crumb, ListingChip } from './ProductListing';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export interface CategoryListingProps {
  section: CatalogSection;
  /** Parent section, when rendering a subcategory. */
  parent?: CatalogSection;
}

async function fetchSectionProducts(query: Record<string, string>): Promise<Product[]> {
  const params = new URLSearchParams({ ...query, limit: '50' });
  try {
    const res = await fetch(`${API_BASE}/products?${params.toString()}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.data?.products ?? [];
  } catch {
    return [];
  }
}

/**
 * Section pages. This only resolves the section's context — breadcrumbs, sibling
 * chips and the server-rendered first page — then hands off to ProductListing,
 * which every product page on the site shares.
 */
export const CategoryListing = async ({ section, parent }: CategoryListingProps) => {
  const initialProducts = await fetchSectionProducts(section.query);

  const crumbs: Crumb[] = [
    { label: 'Home', href: '/' },
    { label: 'Products', href: '/products' },
    ...(parent ? [{ label: parent.title, href: `/products/${parent.slug}` }] : []),
    { label: section.title },
  ];

  /**
   * The same strip on the parent page and on every child of it, with exactly one
   * entry marked current. "All X" used to be added only when a parent existed,
   * so clicking it landed on the parent page — where it promptly disappeared and
   * nothing read as selected.
   */
  const root = parent ?? section;
  const siblings = root.children ?? [];
  const chips: ListingChip[] =
    siblings.length === 0
      ? []
      : [
          { label: `All ${root.title}`, href: `/products/${root.slug}`, active: !parent },
          ...siblings.map((child) => ({
            label: child.title,
            href: `/products/${root.slug}/${child.slug}`,
            active: Boolean(parent) && child.slug === section.slug,
          })),
        ];

  return (
    // ProductListing calls useSearchParams, which opts this subtree out of
    // prerendering — so the static HTML for the page IS this fallback. Render
    // the products into it rather than a spinner: crawlers and the first paint
    // then get the real grid instead of a loading state.
    <Suspense
      fallback={
        <div className="section-y">
          <div className="container-max">
            <h1 className="heading-rule mb-5">{section.title}</h1>
            <ProductGrid products={initialProducts.slice(0, 12)} columns={4} />
          </div>
        </div>
      }
    >
      <ProductListing
        title={section.title}
        crumbs={crumbs}
        chips={chips}
        baseQuery={section.query}
        match={section.match}
        exclude={section.exclude}
        initialProducts={initialProducts}
      />
    </Suspense>
  );
};
