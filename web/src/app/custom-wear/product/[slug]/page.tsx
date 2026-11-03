import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductView, CustomWearThemeProvider } from '@/components/custom-wear';
import type { Crumb } from '@/components/custom-wear';
import { getCategoryById } from '@/config/custom-wear/taxonomy';
import {
  fetchAllCustomWearSlugs,
  fetchCustomWearProductBySlug,
  fetchRelatedProducts,
} from '@/lib/custom-wear/api';
import { buildBreadcrumbSchema } from '@/lib/custom-wear/collection-page';
import type { CustomWearProduct } from '@/types/custom-wear';
import { SITE_NAME } from '@/config/site';
import { siteUrl } from '@/lib/site-url';

const SITE_URL = siteUrl();

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await fetchAllCustomWearSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchCustomWearProductBySlug(slug);

  if (!product) {
    return { title: 'Product not found' };
  }

  const url = `${SITE_URL}/custom-wear/product/${product.slug}`;
  const image = product.images[0]?.url;

  return {
    title: product.name,
    description: product.shortDescription,
    alternates: { canonical: url },
    openGraph: {
      title: product.name,
      description: product.shortDescription,
      url,
      type: 'website',
      siteName: SITE_NAME,
      images: image ? [{ url: `${SITE_URL}${image}` }] : undefined,
    },
  };
}

function buildProductSchema(product: CustomWearProduct) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription,
    sku: product.sku,
    image: product.images.slice(0, 4).map((image) => `${SITE_URL}${image.url}`),
    brand: { '@type': 'Brand', name: SITE_NAME },
    ...(product.rating && product.reviewCount
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.rating,
            reviewCount: product.reviewCount,
          },
        }
      : {}),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: product.currency,
      lowPrice: product.basePrice,
      highPrice: product.maxPrice ?? product.basePrice,
      offerCount: product.priceTiers?.length ?? 1,
      availability: 'https://schema.org/InStock',
      url: `${SITE_URL}/custom-wear/product/${product.slug}`,
    },
  };
}

export default async function CustomWearProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await fetchCustomWearProductBySlug(slug);

  if (!product) notFound();

  const relatedProducts = await fetchRelatedProducts(product, 6);

  const category = getCategoryById(product.category);
  const breadcrumbs: Crumb[] = [
    { label: 'Home', href: '/' },
    { label: 'Custom Wear', href: '/custom-wear' },
    ...(category
      ? [
          {
            label: category.gender === 'kids' ? 'Kids' : category.gender === 'men' ? 'Men' : 'Women',
            href: `/custom-wear/${category.genderSlug}`,
          },
          { label: category.label, href: `/custom-wear/${category.genderSlug}/${category.typeSlug}` },
        ]
      : []),
    { label: product.name },
  ];

  return (
    <CustomWearThemeProvider>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildProductSchema(product)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildBreadcrumbSchema(breadcrumbs)) }}
      />
      <ProductView
        product={product}
        relatedProducts={relatedProducts}
        breadcrumbs={breadcrumbs}
      />
    </CustomWearThemeProvider>
  );
}
