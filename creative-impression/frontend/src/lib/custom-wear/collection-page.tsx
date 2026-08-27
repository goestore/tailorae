import React from 'react';
import type { Metadata } from 'next';
import { CollectionBrowser, CustomWearThemeProvider } from '@/components/custom-wear';
import type { Crumb } from '@/components/custom-wear';
import { customWearContent } from '@/config/custom-wear/content';
import {
  CUSTOM_WEAR_CATEGORIES,
  type CustomWearCategory,
  type CustomWearCategoryGroup,
} from '@/config/custom-wear/taxonomy';
import { fetchCustomWearProducts } from './api';
import { parseFilters, type SearchParamsInput } from './url-state';
import type { CustomWearFilterState } from '@/types/custom-wear';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://creativeimpression.com';

export interface CollectionPageInput {
  searchParams: SearchParamsInput;
  category?: CustomWearCategory;
  group?: CustomWearCategoryGroup;
}

/**
 * Shared server rendering for `/custom-wear`, `/custom-wear/[gender]` and
 * `/custom-wear/[gender]/[type]`.
 *
 * Filtering and pagination run on the server from the query string, so the
 * browser only receives the current page of products.
 */
export async function renderCollectionPage({
  searchParams,
  category,
  group,
}: CollectionPageInput): Promise<React.ReactElement> {
  const defaults: Partial<CustomWearFilterState> = {};
  if (category) defaults.category = category.id;
  if (!category && group) defaults.gender = [group.gender];

  const filters = parseFilters(searchParams, defaults);
  const result = await fetchCustomWearProducts(filters);

  const heading = category
    ? category.fullLabel
    : group
      ? `Custom ${group.possessive} Wear`
      : customWearContent.collection.defaultHeading;

  /*
   * No visible blurb. It restated the category name in a sentence and read the
   * same on every listing. `buildCollectionMetadata` keeps its own description
   * for search engines and social cards, which is where that text belongs.
   */

  const breadcrumbs: Crumb[] = [
    { label: 'Home', href: '/' },
    { label: 'Custom Wear', href: '/custom-wear' },
  ];
  if (group) breadcrumbs.push({ label: group.label, href: `/custom-wear/${group.genderSlug}` });
  if (category) breadcrumbs.push({ label: category.label });

  return (
    <CustomWearThemeProvider>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildBreadcrumbSchema(breadcrumbs)),
        }}
      />
      <CollectionBrowser
        result={result}
        defaults={defaults}
        heading={heading}
        breadcrumbs={breadcrumbs}
      />
    </CustomWearThemeProvider>
  );
}

export function buildBreadcrumbSchema(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      ...(crumb.href ? { item: `${SITE_URL}${crumb.href}` } : {}),
    })),
  };
}

export function buildCollectionMetadata(
  category?: CustomWearCategory,
  group?: CustomWearCategoryGroup
): Metadata {
  const path = category
    ? `/custom-wear/${category.genderSlug}/${category.typeSlug}`
    : group
      ? `/custom-wear/${group.genderSlug}`
      : '/custom-wear';

  const title = category
    ? `${category.fullLabel} | Creative Impression`
    : group
      ? `Custom ${group.possessive} Wear | Creative Impression`
      : 'Custom Wear | Custom T-Shirts, Polos, Hoodies & Sportswear';

  const description = category
    ? `Order custom ${group?.label.toLowerCase() ?? ''} ${category.label.toLowerCase()} with printing or embroidery. Bulk pricing, no-minimum options and fast delivery.`
    : group
      ? `Customizable ${group.possessive.toLowerCase()} polos, t-shirts, hoodies, sweatshirts and sportswear with printing and embroidery.`
      : 'Design custom apparel for teams, businesses and events. Shop customizable polos, t-shirts, hoodies, sweatshirts and sportswear, or request a bulk quote.';

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}${path}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${path}`,
      type: 'website',
      siteName: 'Creative Impression',
    },
  };
}

/** Every category route, for `generateStaticParams`. */
export const allCategoryParams = CUSTOM_WEAR_CATEGORIES.map((category) => ({
  gender: category.genderSlug,
  type: category.typeSlug,
}));
