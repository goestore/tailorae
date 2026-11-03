import {
  buildCategoryTree,
  categoryScope,
  flattenTree,
  resolveTemplate,
  wouldCreateCycle,
  type CategoryRow,
} from '@/utils/category-tree';

const row = (id: string, parentId: string | null, extra: Partial<CategoryRow> = {}): CategoryRow => ({
  id,
  name: id,
  slug: id,
  parentId,
  displayOrder: 0,
  isActive: true,
  image: null,
  listingTemplate: null,
  commissionRate: null,
  ...extra,
});

const rows = [
  row('kids', null, { displayOrder: 3 }),
  row('dresses', 'kids'),
  row('footwear', null, { displayOrder: 4, listingTemplate: 'footwear' }),
  row('sneakers', 'footwear'),
  row('womens', null, { displayOrder: 1 }),
];

describe('category tree', () => {
  it('nests by parent, ordered, with paths and inherited templates', () => {
    const tree = buildCategoryTree(rows);
    expect(tree.map((n) => n.slug)).toEqual(['womens', 'kids', 'footwear']);
    const sneakers = flattenTree(tree).find((n) => n.slug === 'sneakers')!;
    expect(sneakers).toMatchObject({ depth: 1, path: ['footwear', 'sneakers'], resolvedTemplate: 'footwear' });
  });

  it('resolves a template up the parents', () => {
    expect(resolveTemplate(rows, 'sneakers')).toBe('footwear');
    expect(resolveTemplate(rows, 'dresses')).toBeNull();
  });

  it('refuses a move that would make a loop', () => {
    expect(wouldCreateCycle(rows, 'footwear', 'sneakers')).toBe(true);
    expect(wouldCreateCycle(rows, 'footwear', 'footwear')).toBe(true);
    expect(wouldCreateCycle(rows, 'dresses', 'womens')).toBe(false);
    expect(wouldCreateCycle(rows, 'dresses', null)).toBe(false);
  });

  it('covers a category and its descendants, and nothing for an unknown one', () => {
    expect(categoryScope(rows, 'footwear').sort()).toEqual(['footwear', 'sneakers']);
    expect(categoryScope(rows, 'nope')).toEqual([]);
  });

  it('survives a loop written straight into the database', () => {
    const looped = [row('a', 'b'), row('b', 'a'), row('c', null)];
    expect(flattenTree(buildCategoryTree(looped)).map((n) => n.id)).toEqual(['c']);
  });
});
