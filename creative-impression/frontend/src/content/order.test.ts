import { describe, expect, it } from 'vitest';
import { HOME_SECTIONS, HOME_SECTION_IDS } from '@/config/home-sections';
import { HOME_SECTION_COMPONENTS } from '@/components/home/sections';
import { ICON_NAMES } from '@/components/common/Icon';
import { defineContent } from './define';
import { field, resolveOrder, sameFieldValue } from './field';
import { resolveContent } from './resolve';
import { homeContent } from './schema/home';

const SECTIONS = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
] as const;

const ids = SECTIONS.map((s) => s.id);

describe('field.order', () => {
  const demo = defineContent('demo', { page: { order: field.order(SECTIONS) } });
  const orderField = demo.paths[0].field;

  it('defaults to the declared order', () => {
    expect(demo.defaults.page.order).toEqual(['a', 'b', 'c']);
  });

  it('accepts a rearrangement', () => {
    expect(orderField.validate(['c', 'a', 'b'])).toBeNull();
  });

  // Completeness is deliberately not required: an order saved before a section
  // existed must keep working rather than be thrown away wholesale.
  it('accepts a partial order', () => {
    expect(orderField.validate(['b'])).toBeNull();
  });

  it('rejects unknown ids, duplicates and non-lists', () => {
    expect(orderField.validate(['a', 'nope'])).toContain('Unknown section');
    expect(orderField.validate(['a', 'a'])).toContain('more than once');
    expect(orderField.validate('a,b,c')).toContain('list');
    expect(orderField.validate([1, 2])).toContain('section id');
  });
});

describe('resolveOrder', () => {
  it('returns the canonical order when nothing is stored', () => {
    expect(resolveOrder(undefined, ids)).toEqual(['a', 'b', 'c']);
    expect(resolveOrder(null, ids)).toEqual(['a', 'b', 'c']);
    expect(resolveOrder('not a list', ids)).toEqual(['a', 'b', 'c']);
  });

  it('honours a stored rearrangement', () => {
    expect(resolveOrder(['c', 'b', 'a'], ids)).toEqual(['c', 'b', 'a']);
  });

  /*
   * The two ways a stored order goes stale. Neither may cost the arrangement:
   * a section added later appears at the end, and one that no longer exists is
   * dropped rather than rendering a hole.
   */
  it('appends sections the stored order never knew about', () => {
    expect(resolveOrder(['c', 'a'], ids)).toEqual(['c', 'a', 'b']);
  });

  it('drops ids that are no longer sections', () => {
    expect(resolveOrder(['c', 'removed', 'a', 'b'], ids)).toEqual(['c', 'a', 'b']);
  });

  it('drops duplicates, keeping the first position', () => {
    expect(resolveOrder(['b', 'a', 'b'], ids)).toEqual(['b', 'a', 'c']);
  });

  it('always returns every section exactly once', () => {
    for (const stored of [[], ['b'], ['x'], ['c', 'c', 'c'], ids]) {
      expect([...resolveOrder(stored, ids)].sort()).toEqual([...ids].sort());
    }
  });
});

describe('sameFieldValue', () => {
  // Why this exists: a reorder always builds a new array, so reference
  // equality would report a phantom unpublished change.
  it('compares arrays by content, not reference', () => {
    expect(sameFieldValue(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameFieldValue(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameFieldValue(['a'], ['a', 'b'])).toBe(false);
  });

  it('falls back to Object.is for everything else', () => {
    expect(sameFieldValue('x', 'x')).toBe(true);
    expect(sameFieldValue(1, 2)).toBe(false);
    expect(sameFieldValue(null, undefined)).toBe(false);
  });
});

describe('home namespace', () => {
  it('defaults to the order the page ships with', () => {
    expect(resolveContent(homeContent).sections.order).toEqual(HOME_SECTION_IDS);
  });

  it('applies a published rearrangement', () => {
    const moved = ['services', 'hero', 'categories', 'best-selling', 'why-choose-us', 'featured-products', 'cta'];
    const resolved = resolveContent(homeContent, {
      values: [{ path: '/sections/order', value: moved }],
    });
    expect(resolved.sections.order).toEqual(moved);
  });

  // A bad order must not blank the home page.
  it('falls back to the shipped order when the stored value is invalid', () => {
    const resolved = resolveContent(homeContent, {
      values: [{ path: '/sections/order', value: ['hero', 'hero'] }],
    });
    expect(resolved.sections.order).toEqual(HOME_SECTION_IDS);
  });

  /*
   * The guarantee that keeps the registry honest: the admin offers exactly the
   * sections the page can render. A mismatch would either hide a section from
   * the editor or crash the page on an id with no component.
   */
  it('has a component for every listed section, and no extras', () => {
    expect(Object.keys(HOME_SECTION_COMPONENTS).sort()).toEqual([...HOME_SECTION_IDS].sort());
  });

  it('gives every section a human label for the admin', () => {
    for (const section of HOME_SECTIONS) {
      expect(section.label.trim()).not.toBe('');
    }
  });
});

describe('field.list', () => {
  const cardFields = {
    title: field.text('Untitled', { max: 20 }),
    icon: field.select(['a', 'b'] as const, 'a'),
  };
  const shipped = [
    { title: 'One', icon: 'a' },
    { title: 'Two', icon: 'b' },
  ];
  const demo = defineContent('demo-list', {
    band: { items: field.list(cardFields, shipped, { max: 3 }) },
  });
  const listField = demo.paths[0].field;

  it('defaults to the shipped items', () => {
    expect(demo.defaults.band.items).toEqual(shipped);
  });

  it('accepts a rearranged and edited list', () => {
    expect(listField.validate([{ title: 'Two', icon: 'b' }, { title: 'One', icon: 'a' }])).toBeNull();
  });

  /*
   * Missing keys must stay valid. A field added to an item's schema would
   * otherwise invalidate every item saved before it existed — turning a schema
   * change into silent data loss across the whole list.
   */
  it('accepts items with keys the schema gained later', () => {
    expect(listField.validate([{ title: 'Only a title' }])).toBeNull();
  });

  it('rejects a present-but-invalid value, naming the item', () => {
    expect(listField.validate([{ title: 'ok' }, { title: '' }])).toContain('Item 2');
    expect(listField.validate([{ icon: 'nope' }])).toContain('Item 1');
  });

  it('rejects non-lists, non-objects and over-length lists', () => {
    expect(listField.validate('nope')).toContain('list');
    expect(listField.validate(['a string'])).toContain('not a set of values');
    expect(listField.validate([{}, {}, {}, {}])).toContain('At most 3');
  });

  it('normalises missing keys to their field defaults', () => {
    expect(listField.normalise?.([{ title: 'Kept' }])).toEqual([{ title: 'Kept', icon: 'a' }]);
  });

  it('drops keys the schema no longer declares', () => {
    expect(listField.normalise?.([{ title: 'Kept', gone: 'x' }])).toEqual([
      { title: 'Kept', icon: 'a' },
    ]);
  });

  it('replaces an invalid stored value with the field default', () => {
    expect(listField.normalise?.([{ title: '', icon: 'zzz' }])).toEqual([
      { title: 'Untitled', icon: 'a' },
    ]);
  });

  // Removing every card is how a band is turned off, so it must survive the
  // round trip rather than being restored to the defaults.
  it('honours an explicitly empty list', () => {
    const resolved = resolveContent(demo, { values: [{ path: '/band/items', value: [] }] });
    expect(resolved.band.items).toEqual([]);
  });

  it('completes stored items when resolved', () => {
    const resolved = resolveContent(demo, {
      values: [{ path: '/band/items', value: [{ title: 'Solo' }] }],
    });
    expect(resolved.band.items).toEqual([{ title: 'Solo', icon: 'a' }]);
  });

  it('falls back to the shipped items when the stored value is not a list', () => {
    const resolved = resolveContent(demo, {
      values: [{ path: '/band/items', value: 'broken' }],
    });
    expect(resolved.band.items).toEqual(shipped);
  });
});

describe('home card bands', () => {
  it('ships the four cards each band had hardcoded', () => {
    const resolved = resolveContent(homeContent);
    expect(resolved.whyChooseUs.items).toHaveLength(4);
    expect(resolved.services.items).toHaveLength(4);
    expect(resolved.whyChooseUs.items[0]).toMatchObject({ title: 'Premium Quality' });
    expect(resolved.services.items[0]).toMatchObject({ href: '/customization' });
  });

  // Every icon must be one the set can actually draw, or the card renders a gap.
  it('only uses icons the Icon component defines', () => {
    const resolved = resolveContent(homeContent);
    for (const item of [...resolved.whyChooseUs.items, ...resolved.services.items]) {
      expect(ICON_NAMES).toContain(item.icon);
    }
  });
});

describe('call to action', () => {
  /*
   * The component drops a button with no label, which is the only way to show
   * a single call to action. If the field rejected an empty string the value
   * would never reach the component and the button would reappear — a
   * contradiction between schema and component that renders as "the admin
   * does not work".
   */
  it('accepts an emptied button label', () => {
    const resolved = resolveContent(homeContent, {
      values: [{ path: '/cta/secondaryLabel', value: '' }],
    });
    expect(resolved.cta.secondaryLabel).toBe('');
    expect(resolved.cta.primaryLabel).toBe('Shop Products');
  });
});
