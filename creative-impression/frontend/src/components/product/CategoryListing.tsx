import React, { Suspense } from 'react';
import { ProductGrid } from './ProductGrid';
import { CatalogSection } from '@/config/catalog';
import { Product } from '@/types';
import { ProductListing, Crumb, ListingChip } from './ProductListing';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export interface CategoryListingProps {
  section: CatalogSection;
  /**
   * Breadcrumbs and sibling chips worked out by the caller. Category pages
   * (/products/<dept>/…, /c/…) pass these from the live category tree.
   */
  crumbs?: Crumb[];
  chips?: ListingChip[];
}

/** Must match ProductListing's page size, or the client refetches on mount. */
const SSR_PAGE_SIZE = 24;

/**
 * The first page, rendered on the server so crawlers and slow connections get
 * products in the HTML.
 *
 * Category pages scope by `category` (the API includes its subcategories).
 */
async function fetchSectionProducts(
  section: CatalogSection
): Promise<{ products: Product[]; total: number }> {
  const params = new URLSearchParams({ ...section.query, limit: String(SSR_PAGE_SIZE) });

  try {
    const res = await fetch(`${API_BASE}/products?${params.toString()}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { products: [], total: 0 };
    const json = await res.json();
    const products: Product[] = json?.data?.products ?? [];
    const total = json?.data?.pagination?.total;
    return { products, total: typeof total === 'number' ? total : products.length };
  } catch {
    return { products: [], total: 0 };
  }
}

/**
 * Section pages. This only resolves the section's context — breadcrumbs, sibling
 * chips and the server-rendered first page — then hands off to ProductListing,
 * which every product page on the site shares.
 */
export const CategoryListing = async ({
  section,
  crumbs: givenCrumbs,
  chips: givenChips,
}: CategoryListingProps) => {
  const { products: initialProducts, total: initialTotal } = await fetchSectionProducts(section);

  const crumbs: Crumb[] = givenCrumbs ?? [
    { label: 'Home', href: '/' },
    { label: 'Products', href: '/products' },
    { label: section.title },
  ];
  const chips: ListingChip[] = givenChips ?? [];

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
        initialProducts={initialProducts}
        initialTotal={initialTotal}
      />
    </Suspense>
  );
};
