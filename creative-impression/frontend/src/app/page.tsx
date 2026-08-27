import { Metadata } from 'next';
import { HOME_SECTION_IDS, type HomeSectionId } from '@/config/home-sections';
import { HOME_SECTION_COMPONENTS } from '@/components/home/sections';
import { resolveOrder } from '@/content/field';
import { homeContent } from '@/content/schema/home';
import { loadContent } from '@/content/source';

export const metadata: Metadata = {
  title: 'Home | Creative Impression',
  description: 'Welcome to Creative Impression - Premium Fashion & Custom Apparel Platform',
};

/**
 * The home page, composed from the published section order.
 *
 * The page no longer decides what comes after what — `content/schema/home.ts`
 * does, and the admin edits it. `resolveOrder` guarantees the result is always
 * a complete, duplicate-free list of sections that exist, whatever is stored,
 * so a stale or partial order still renders a whole page.
 *
 * With nothing published this is byte-for-byte the order the page shipped with.
 */
export default async function Home() {
  const content = await loadContent(homeContent);
  const order = resolveOrder(content.sections.order, HOME_SECTION_IDS) as readonly HomeSectionId[];

  return (
    // Whichever band lands first should not draw a rule against the header:
    // the separator belongs between sections, not above the page.
    <div className="min-h-screen [&>*:first-child]:border-t-0">
      {order.map((id) => {
        const Section = HOME_SECTION_COMPONENTS[id];
        return <Section key={id} content={content} />;
      })}
    </div>
  );
}
