import React from 'react';
import type { Metadata } from 'next';
import { fetchProduct } from '@/lib/server-products';
import { absoluteUrl } from '@/lib/site-url';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

/** Uploaded images are stored as site-relative paths; cards need absolute ones. */
const toAbsolute = (image?: string | null): string | null => {
  if (!image) return null;
  return image.startsWith('http') ? image : absoluteUrl(image);
};

/** Trim to a length a search result will actually show, on a word boundary. */
const summarise = (text: string, limit = 155): string => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, clean.lastIndexOf(' ', limit - 1))}…`;
};

/**
 * The product page is a client component, so it cannot export metadata itself.
 * This layout resolves it on the server instead — until now every product in
 * the catalogue shared the site-wide title, which is one duplicate-title
 * warning per product in Search Console and a useless snippet in results.
 *
 * `metaTitle` and `metaDescription` are already editable per product in the
 * admin; nothing read them. They win here, with the product's own name and
 * description as the fallback.
 */
export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { id } = await params;
  const product = await fetchProduct(id);

  if (!product) {
    return { title: 'Product | Creative Impression' };
  }

  const title = product.metaTitle?.trim() || `${product.name} | Creative Impression`;
  const description =
    product.metaDescription?.trim() ||
    summarise(
      product.shortDescription ||
        product.description ||
        `${product.name} from Creative Impression. Customization and bulk pricing available.`
    );
  const image = toAbsolute(product.thumbnail || product.images?.[0]);
  const canonical = `/products/${product.slug || product.id}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title,
      description,
      url: absoluteUrl(canonical),
      ...(image ? { images: [{ url: image, alt: product.name }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

// JSON.stringify does not escape the three characters that can close a script
// tag early, and product names and descriptions are author-supplied.
function ldJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export default async function ProductLayout({ children, params }: LayoutProps) {
  const { id } = await params;
  const product = await fetchProduct(id);

  if (!product) return <>{children}</>;

  const image = toAbsolute(product.thumbnail || product.images?.[0]);

  // Product markup is what puts the price, the stock state and the star rating
  // into a search result rather than just a blue link.
  const productLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    ...(product.description ? { description: summarise(product.description, 400) } : {}),
    sku: product.sku,
    ...(image ? { image: [image] } : {}),
    ...(product.category?.name ? { category: product.category.name } : {}),
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(`/products/${product.slug || product.id}`),
      priceCurrency: 'INR',
      price: product.price,
      availability:
        product.quantity > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
    },
  };

  // Only claim a rating when one has actually been left. An aggregateRating of
  // zero out of zero reviews is a structured-data error, not a neutral default.
  if (product.reviewCount > 0 && product.rating > 0) {
    productLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(product.rating.toFixed(1)),
      reviewCount: product.reviewCount,
    };
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(productLd) }} />
      {children}
    </>
  );
}
