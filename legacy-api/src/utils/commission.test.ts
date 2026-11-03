import {
  createCommissionResolver,
  pickCommissionRate,
  type CategoryRateRow,
} from '@/utils/commission';

/**
 * Which rate a line is charged at. The case worth pinning above all others is
 * the null override: read as zero, every shop without a negotiated deal paid
 * no commission at all.
 */

/** Kids (15%) > Girls (unset) > Dresses (unset); Men (unset); Sale (0%). */
const TREE: Record<string, CategoryRateRow> = {
  kids: { parentId: null, commissionRate: 15 },
  girls: { parentId: 'kids', commissionRate: null },
  dresses: { parentId: 'girls', commissionRate: null },
  men: { parentId: null, commissionRate: null },
  sale: { parentId: null, commissionRate: 0 },
  loopA: { parentId: 'loopB', commissionRate: null },
  loopB: { parentId: 'loopA', commissionRate: null },
};

const loaderWithCount = () => {
  const reads: string[] = [];
  const load = async (id: string) => {
    reads.push(id);
    return TREE[id] ?? null;
  };
  return { load, reads };
};

describe('pickCommissionRate', () => {
  it('charges house stock nothing', () => {
    expect(
      pickCommissionRate({ vendorId: null, vendorOverride: 20, categoryRate: 15, defaultRate: 10 })
    ).toBe(0);
  });

  it('prefers the seller override over everything', () => {
    expect(
      pickCommissionRate({ vendorId: 's', vendorOverride: 8, categoryRate: 15, defaultRate: 10 })
    ).toBe(8);
  });

  it('treats a null override as unset, not as zero', () => {
    expect(
      pickCommissionRate({ vendorId: 's', vendorOverride: null, categoryRate: 15, defaultRate: 10 })
    ).toBe(15);
  });

  it('honours an explicit zero override', () => {
    expect(
      pickCommissionRate({ vendorId: 's', vendorOverride: 0, categoryRate: 15, defaultRate: 10 })
    ).toBe(0);
  });

  it('falls back to the platform default', () => {
    expect(
      pickCommissionRate({ vendorId: 's', vendorOverride: null, categoryRate: null, defaultRate: 10 })
    ).toBe(10);
  });
});

describe('createCommissionResolver', () => {
  it('inherits the nearest ancestor rate', async () => {
    const { load } = loaderWithCount();
    const resolver = createCommissionResolver(load, 10);
    expect(await resolver.rateFor('s', null, 'dresses')).toBe(15);
  });

  it('uses the default when no category in the chain sets a rate', async () => {
    const { load } = loaderWithCount();
    expect(await createCommissionResolver(load, 10).rateFor('s', null, 'men')).toBe(10);
  });

  it('treats a category rate of zero as set', async () => {
    const { load } = loaderWithCount();
    expect(await createCommissionResolver(load, 10).rateFor('s', null, 'sale')).toBe(0);
  });

  it('does not read categories for an overridden shop or house stock', async () => {
    const { load, reads } = loaderWithCount();
    const resolver = createCommissionResolver(load, 10);
    expect(await resolver.rateFor('s', 8, 'dresses')).toBe(8);
    expect(await resolver.rateFor(null, null, 'dresses')).toBe(0);
    expect(reads).toEqual([]);
  });

  it('reads each category once across many lines', async () => {
    const { load, reads } = loaderWithCount();
    const resolver = createCommissionResolver(load, 10);
    await resolver.rateFor('s', null, 'dresses');
    await resolver.rateFor('t', null, 'dresses');
    await resolver.rateFor('s', null, 'girls');
    expect(reads).toEqual(['dresses', 'girls', 'kids']);
  });

  it('survives a cycle in the tree', async () => {
    const { load } = loaderWithCount();
    expect(await createCommissionResolver(load, 10).rateFor('s', null, 'loopA')).toBe(10);
  });

  it('falls back to the default for a missing category or none at all', async () => {
    const { load } = loaderWithCount();
    const resolver = createCommissionResolver(load, 12);
    expect(await resolver.rateFor('s', null, 'nope')).toBe(12);
    expect(await resolver.rateFor('s', null, null)).toBe(12);
  });
});
