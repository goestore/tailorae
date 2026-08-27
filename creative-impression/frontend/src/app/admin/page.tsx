import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Admin | Creative Impression' };

/**
 * The admin index.
 *
 * Replaces a page of buttons that did nothing: "Add New Banner", "Edit" and
 * "View" were all inert, and the only working control was a featured toggle.
 * Everything listed here goes somewhere real.
 */

interface Destination {
  href: string;
  title: string;
  description: string;
}

const CATALOG: Destination[] = [
  {
    href: '/admin/products',
    title: 'Products',
    description:
      'Add, edit and delete products. Set prices, stock, images and which ones are live in the shop.',
  },
];

const STOREFRONT: Destination[] = [
  {
    href: '/admin/content/home',
    title: 'Home page',
    description:
      'Reorder the bands, choose which products and categories each one shows, and edit the cards and banner images.',
  },
  {
    href: '/admin/content/brand',
    title: 'Brand',
    description: 'Store name, announcement bar, brand colours and the page gutter.',
  },
  {
    href: '/admin/content/layout',
    title: 'Layout',
    description: 'Site-wide layout values.',
  },
  {
    href: '/admin/content/custom-wear',
    title: 'Custom Wear',
    description: 'Copy for the Custom Wear collection and product pages.',
  },
  {
    href: '/admin/content/custom-wear-theme',
    title: 'Custom Wear theme',
    description: 'Colours, spacing and type for the Custom Wear section.',
  },
];

const Group: React.FC<{ heading: string; items: Destination[] }> = ({ heading, items }) => (
  <section className="flex flex-col gap-3">
    <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">{heading}</h2>
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className="flex h-full flex-col gap-1 border border-line bg-surface p-4 hover:border-line-strong hover:bg-surface-2"
          >
            <span className="text-sm font-semibold text-ink">{item.title}</span>
            <span className="text-sm leading-relaxed text-ink-3">{item.description}</span>
          </Link>
        </li>
      ))}
    </ul>
  </section>
);

export default function AdminHome() {
  return (
    <div className="container-max section-y flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink">Admin</h1>
        <p className="text-sm text-ink-2">
          Changes to content are saved as a draft and go live when you publish. Product changes are
          live as soon as you save them.
        </p>
      </header>

      <Group heading="Catalog" items={CATALOG} />
      <Group heading="Storefront content" items={STOREFRONT} />
    </div>
  );
}
