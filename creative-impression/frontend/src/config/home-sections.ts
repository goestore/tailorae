import type { OrderItem } from '@/content/field';

/**
 * The bands the home page is built from, in the order it ships with.
 *
 * This list is the single source of truth for three things that must never
 * disagree: what the admin offers to reorder, what the storefront knows how to
 * render, and what an `order` field will accept as a valid id. It holds no
 * React so both the client-side admin registry and the server-rendered page
 * can import it without dragging components across the boundary.
 *
 * Adding a section: add it here, then add its component to
 * `components/home/sections.tsx`. TypeScript fails the build if you do one
 * without the other. Orders saved before the addition keep working — the new
 * section appears at the end until someone moves it.
 */
export const HOME_SECTIONS = [
  { id: 'hero', label: 'Hero banner' },
  { id: 'categories', label: 'Explore all categories' },
  { id: 'best-selling', label: 'Best selling' },
  { id: 'why-choose-us', label: 'Why choose Creative Impression?' },
  { id: 'featured-products', label: 'Featured products' },
  { id: 'services', label: 'Our services' },
  { id: 'cta', label: 'Ready to start your order?' },
] as const satisfies readonly OrderItem[];

export type HomeSectionId = (typeof HOME_SECTIONS)[number]['id'];

export const HOME_SECTION_IDS: readonly HomeSectionId[] = HOME_SECTIONS.map((section) => section.id);
