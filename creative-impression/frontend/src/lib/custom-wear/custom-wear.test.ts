import { describe, expect, it } from 'vitest';
import { CUSTOM_WEAR_PRODUCTS } from '@/data/custom-wear/products';
import { CUSTOM_WEAR_CATEGORIES } from '@/config/custom-wear/taxonomy';
import { calculatePricing, formatTierRange, unitPriceForQuantity } from './pricing';
import { EMPTY_FILTERS, buildActiveChips, clearAllFilters, queryProducts } from './filters';
import { parseFilters, serializeFilters } from './url-state';
import { estimateDelivery, isValidPostcode } from './shipping';
import type { CustomWearFilterState } from '@/types/custom-wear';

const polo = CUSTOM_WEAR_PRODUCTS.find((p) => p.id === 'cw-men-polo-classic')!;

const withFilters = (overrides: Partial<CustomWearFilterState>): CustomWearFilterState => ({
  ...EMPTY_FILTERS,
  ...overrides,
});

describe('pricing', () => {
  it('walks down the tier table as quantity grows', () => {
    expect(unitPriceForQuantity(polo, 1)).toBe(570);
    expect(unitPriceForQuantity(polo, 9)).toBe(570);
    expect(unitPriceForQuantity(polo, 10)).toBe(540);
    expect(unitPriceForQuantity(polo, 25)).toBe(495);
    expect(unitPriceForQuantity(polo, 50)).toBe(450);
    expect(unitPriceForQuantity(polo, 100)).toBe(399);
    expect(unitPriceForQuantity(polo, 5000)).toBe(399);
  });

  it('computes subtotal, savings and the next tier', () => {
    const pricing = calculatePricing({ product: polo, quantity: 50 });
    expect(pricing.baseUnitPrice).toBe(450);
    expect(pricing.subtotal).toBe(22_500);
    // 50 units at tier-1 (570) would cost 28,500 — a 6,000 saving.
    expect(pricing.savings).toBe(6_000);
    expect(pricing.nextTier?.minQty).toBe(100);
  });

  it('adds the customization method surcharge and setup fee', () => {
    const plain = calculatePricing({ product: polo, quantity: 50 });
    const embroidered = calculatePricing({
      product: polo,
      quantity: 50,
      method: 'embroidery',
      locations: ['left-chest'],
    });

    expect(embroidered.unitPrice).toBe(plain.unitPrice + 85);
    expect(embroidered.setupFee).toBe(600);
    expect(embroidered.total).toBe(embroidered.unitPrice * 50 + 600);
  });

  it('charges extra branding locations beyond the first', () => {
    const one = calculatePricing({
      product: polo,
      quantity: 10,
      method: 'embroidery',
      locations: ['left-chest'],
    });
    const two = calculatePricing({
      product: polo,
      quantity: 10,
      method: 'embroidery',
      locations: ['left-chest', 'full-back'],
    });
    expect(two.unitPrice).toBeGreaterThan(one.unitPrice);
  });

  it('ignores methods the product does not support', () => {
    const unsupported = calculatePricing({ product: polo, quantity: 10, method: 'sublimation' });
    expect(unsupported.customizationPerUnit).toBe(0);
    expect(unsupported.setupFee).toBe(0);
  });

  it('never drops below one unit', () => {
    expect(calculatePricing({ product: polo, quantity: 0 }).quantity).toBe(1);
    expect(calculatePricing({ product: polo, quantity: -5 }).quantity).toBe(1);
  });

  it('labels tier ranges', () => {
    expect(formatTierRange({ minQty: 1, maxQty: 9, pricePerUnit: 570 })).toBe('1–9 units');
    expect(formatTierRange({ minQty: 100, maxQty: null, pricePerUnit: 399 })).toBe('100+ units');
  });
});

describe('catalogue integrity', () => {
  it('covers all 15 configured categories', () => {
    expect(CUSTOM_WEAR_CATEGORIES).toHaveLength(15);
    const covered = new Set(CUSTOM_WEAR_PRODUCTS.map((product) => product.category));
    const missing = CUSTOM_WEAR_CATEGORIES.filter((category) => !covered.has(category.id));
    expect(missing.map((category) => category.id)).toEqual([]);
  });

  it('uses category ids that exist in the taxonomy', () => {
    const ids = new Set(CUSTOM_WEAR_CATEGORIES.map((category) => category.id));
    CUSTOM_WEAR_PRODUCTS.forEach((product) => {
      expect(ids.has(product.category)).toBe(true);
    });
  });

  it('points related product ids at real products', () => {
    const ids = new Set(CUSTOM_WEAR_PRODUCTS.map((product) => product.id));
    CUSTOM_WEAR_PRODUCTS.forEach((product) => {
      (product.relatedProductIds ?? []).forEach((id) => expect(ids.has(id)).toBe(true));
    });
  });
});

describe('filtering', () => {
  it('combines filters with AND across groups and OR within a group', () => {
    const all = queryProducts(CUSTOM_WEAR_PRODUCTS, EMPTY_FILTERS).total;
    const men = queryProducts(CUSTOM_WEAR_PRODUCTS, withFilters({ gender: ['men'] })).total;
    const menPolo = queryProducts(
      CUSTOM_WEAR_PRODUCTS,
      withFilters({ gender: ['men'], productType: ['polo'] })
    ).total;
    const menOrWomen = queryProducts(
      CUSTOM_WEAR_PRODUCTS,
      withFilters({ gender: ['men', 'women'] })
    ).total;

    expect(all).toBe(CUSTOM_WEAR_PRODUCTS.length);
    expect(menPolo).toBeLessThanOrEqual(men);
    expect(menOrWomen).toBeGreaterThan(men);
  });

  it('returns nothing for an impossible combination', () => {
    const result = queryProducts(
      CUSTOM_WEAR_PRODUCTS,
      withFilters({ gender: ['men'], productType: ['hoodie'], color: ['pink'] })
    );
    expect(result.total).toBe(0);
    expect(result.products).toEqual([]);
  });

  it('sorts by price in both directions', () => {
    const asc = queryProducts(CUSTOM_WEAR_PRODUCTS, withFilters({ sort: 'price-asc' })).products;
    const desc = queryProducts(CUSTOM_WEAR_PRODUCTS, withFilters({ sort: 'price-desc' })).products;
    expect(asc[0].basePrice).toBeLessThanOrEqual(asc[asc.length - 1].basePrice);
    expect(desc[0].basePrice).toBe(asc[asc.length - 1].basePrice);
  });

  it('searches name, SKU and fabric', () => {
    expect(queryProducts(CUSTOM_WEAR_PRODUCTS, withFilters({ search: 'CI-MP-220-CLS' })).total).toBe(1);
    expect(queryProducts(CUSTOM_WEAR_PRODUCTS, withFilters({ search: 'hoodie' })).total).toBeGreaterThan(0);
    expect(queryProducts(CUSTOM_WEAR_PRODUCTS, withFilters({ search: 'zzzz' })).total).toBe(0);
  });

  it('paginates without losing or repeating products', () => {
    const pageOne = queryProducts(CUSTOM_WEAR_PRODUCTS, EMPTY_FILTERS, 5);
    const pageTwo = queryProducts(CUSTOM_WEAR_PRODUCTS, withFilters({ page: 2 }), 5);
    expect(pageOne.products).toHaveLength(5);
    expect(pageOne.pageCount).toBe(Math.ceil(CUSTOM_WEAR_PRODUCTS.length / 5));
    const overlap = pageOne.products.filter((p) => pageTwo.products.some((q) => q.id === p.id));
    expect(overlap).toEqual([]);
  });

  it('clamps an out-of-range page', () => {
    expect(queryProducts(CUSTOM_WEAR_PRODUCTS, withFilters({ page: 999 })).page).toBe(1);
  });

  it('builds one chip per selection and clears them all while keeping mode', () => {
    const filters = withFilters({
      mode: 'quote',
      gender: ['men'],
      color: ['black', 'navy'],
      size: ['XL'],
      category: 'mens-polo',
    });
    expect(buildActiveChips(filters)).toHaveLength(5);

    const cleared = clearAllFilters(filters);
    expect(buildActiveChips(cleared)).toHaveLength(0);
    expect(cleared.mode).toBe('quote');
  });
});

describe('url state', () => {
  it('round-trips every filter through the query string', () => {
    const filters = withFilters({
      mode: 'quote',
      category: 'womens-hoodies',
      gender: ['women'],
      productType: ['hoodie'],
      color: ['black', 'pink'],
      size: ['L', 'XL'],
      fabric: ['cotton-blend'],
      gsm: ['240-plus'],
      method: ['embroidery'],
      location: ['left-chest'],
      moq: ['10-plus'],
      minPrice: 500,
      maxPrice: 1500,
      search: 'hoodie',
      sort: 'price-asc',
      page: 2,
    });

    const restored = parseFilters(new URLSearchParams(serializeFilters(filters)));
    expect(restored).toEqual(filters);
  });

  it('omits values already implied by the route', () => {
    const filters = withFilters({ category: 'mens-polo', color: ['black'] });
    const query = serializeFilters(filters, { category: 'mens-polo' });
    expect(query).not.toContain('category');
    expect(query).toContain('color=black');
  });

  it('ignores unknown categories and sorts from a hand-edited URL', () => {
    const restored = parseFilters(new URLSearchParams('category=made-up&sort=bogus&page=-3'));
    expect(restored.category).toBeNull();
    expect(restored.sort).toBe('recommended');
    expect(restored.page).toBe(1);
  });
});

describe('delivery', () => {
  it('accepts PIN and ZIP formats and rejects junk', () => {
    expect(isValidPostcode('110001')).toBe(true);
    expect(isValidPostcode('SW1A 1AA')).toBe(true);
    expect(isValidPostcode('!!')).toBe(false);
  });

  it('returns standard and express options for a valid postcode', async () => {
    const estimate = await estimateDelivery('110001', { orderValue: 1000 });
    expect(estimate.options.map((option) => option.id)).toEqual(['standard', 'express']);
    expect(estimate.options[0].maxDays).toBeGreaterThanOrEqual(estimate.options[0].minDays);
  });

  it('applies free shipping above the threshold', async () => {
    const cheap = await estimateDelivery('600001', { orderValue: 100 });
    const large = await estimateDelivery('600001', { orderValue: 50_000 });
    expect(large.options[0].cost).toBe(0);
    expect(cheap.options[0].cost).toBeGreaterThanOrEqual(0);
  });

  it('rejects an invalid postcode', async () => {
    await expect(estimateDelivery('??')).rejects.toThrow();
  });
});
