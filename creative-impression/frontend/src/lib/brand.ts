import { brandContent } from '@/content/schema/brand';
import { loadContent } from '@/content/source';

/**
 * The store name as set in the admin's Brand identity namespace.
 *
 * Static pages that name the store in their prose read it from here rather
 * than hard-coding it, so renaming the store in the admin renames it in the
 * policies too. `loadContent` falls back to the compiled default, so this
 * never blocks a page on the backend being up.
 */
export async function getStoreName(): Promise<string> {
  const brand = await loadContent(brandContent);
  return brand.identity.name;
}
