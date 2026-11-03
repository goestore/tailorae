import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import '../styles/globals.css';
import { Providers } from '@/components/providers';
import { SiteFrame } from '@/components/layout/SiteFrame';
import { brandContent } from '@/content/schema/brand';
import { loadContent } from '@/content/source';
import { siteUrl } from '@/lib/site-url';
import { fetchCategoryTree } from '@/lib/category-tree';

const inter = Inter({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-inter-next',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FECC00',
};

/**
 * Title and description come from the `brand` namespace, so renaming the store
 * in the admin renames it everywhere it is announced. `loadContent` falls back
 * to the compiled defaults, so this never blocks metadata on the backend.
 */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await loadContent(brandContent);
  const title = `${brand.identity.name} | ${brand.identity.tagline}`;

  return {
    // Without this, a page-level `alternates.canonical` of "/products/foo"
    // is emitted verbatim, and a relative canonical is not a canonical —
    // crawlers need an absolute one. It also resolves relative OG images.
    metadataBase: new URL(siteUrl()),
    // Pages set only their own part ("Cart"); the template adds the brand.
    title: { default: title, template: `%s | ${brand.identity.name}` },
    description:
      'Shop fashion from independent sellers and brands on TAILORAE — clothing for women, men and kids, with custom tailoring and bulk orders.',
    keywords: 'fashion, clothing, marketplace, custom tailoring, apparel, bulk orders',
    authors: [{ name: brand.identity.name }],
    robots: 'index, follow',
    // Social images come from app/opengraph-image.png, which Next links for
    // every page that does not set its own.
    openGraph: {
      type: 'website',
      locale: 'en_IN',
      url: siteUrl(),
      siteName: brand.identity.name,
      title,
      description: brand.identity.tagline,
    },
    twitter: {
      card: 'summary_large_image',
      title: brand.identity.name,
      description: brand.identity.tagline,
    },
  };
}

/**
 * Editable design tokens, as a `:root` override.
 *
 * `:root:root` rather than `:root`: this block and `globals.css` would
 * otherwise tie on specificity and the winner would depend on which one the
 * bundler emits last. Doubling the selector settles it without `!important`.
 *
 * Only the tokens the `brand` namespace owns are emitted. The ink and surface
 * scales stay in `globals.css` because they carry the contrast guarantees of
 * the design system, and an admin cannot see which pairings they would break.
 */
function brandTokens(brand: Awaited<ReturnType<typeof loadContent<typeof brandContent.schema>>>) {
  return [
    `--brand:${brand.theme.brand}`,
    `--brand-600:${brand.theme.brandHover}`,
    `--sale:${brand.theme.sale}`,
    `--success:${brand.theme.success}`,
    `--gutter:${brand.layout.gutter}`,
    `--content-max:${brand.layout.contentMax}`,
  ].join(';');
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The header's departments come from the category tree; null (API down)
  // keeps the static menu.
  const [brand, categories] = await Promise.all([loadContent(brandContent), fetchCategoryTree()]);

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="x-ua-compatible" content="ie=edge" />
        {/* favicon.ico, icon.png, apple-icon.png and the social images are
            files in app/, which Next links automatically. */}
        <link rel="manifest" href="/manifest.json" />
        {/* Values are colours and lengths that the field validators have
            already constrained, so there is no arbitrary text in here. */}
        <style>{`:root:root{${brandTokens(brand)}}`}</style>
      </head>
      <body>
        <Providers>
          <SiteFrame announcement={brand.announcement} categories={categories}>{children}</SiteFrame>
        </Providers>
      </body>
    </html>
  );
}
