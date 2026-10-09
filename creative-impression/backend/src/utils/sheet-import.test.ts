import {
  normaliseRows,
  sizeChartFrom,
  sizeFromSku,
  titleCase,
  type ImportRow,
} from '@/utils/sheet-import';
import { fieldForHeader, findHeaderRow, headerScore } from '@/utils/sheet-columns';

/**
 * The importer decides what a seller's whole catalogue becomes. Its two risky
 * judgements are finding the header in a sheet that does not start with one,
 * and deciding what to do about a value that is missing.
 */

const row = (values: Record<string, string>, rowNumber = 2): ImportRow => ({
  rowNumber,
  sheet: 'Dresses',
  file: 'test.xlsx',
  values: values as ImportRow['values'],
  issues: [],
});

describe('column matching', () => {
  it('reads Myntra column names', () => {
    expect(fieldForHeader('vendorSkuCode')).toBe('sku');
    expect(fieldForHeader('vendorArticleNumber')).toBe('articleNumber');
    expect(fieldForHeader('articleType')).toBe('category');
    expect(fieldForHeader('Brand Colour (Remarks)')).toBe('colorName');
  });

  it('ignores case, punctuation and bracketed units', () => {
    expect(fieldForHeader('Front Length ( Inches )')).toBe('measureFrontLength');
    expect(fieldForHeader('front_length')).toBe('measureFrontLength');
    expect(fieldForHeader('SELLING PRICE')).toBe('sellingPrice');
  });

  it('returns null for a column nothing recognises, rather than guessing', () => {
    expect(fieldForHeader('supplier internal ref')).toBeNull();
  });
});

describe('findHeaderRow', () => {
  it('finds a header that is not the first row', () => {
    // Myntra's shape: a version banner, a band of section names, then the header.
    const matrix = [
      ['Version : 11', '', ''],
      ['Business (Information required)', '', ''],
      ['vendorSkuCode', 'vendorArticleNumber', 'MRP'],
      ['A-1', 'A', '999'],
    ];
    expect(findHeaderRow(matrix)).toBe(2);
  });

  it('refuses to pick a row that recognises almost nothing', () => {
    expect(findHeaderRow([['notes'], ['some text']])).toBe(-1);
  });

  it('counts distinct fields, so repeated columns do not win', () => {
    expect(headerScore(['size', 'size', 'size'])).toBe(1);
    expect(headerScore(['sku', 'size', 'mrp'])).toBe(3);
  });
});

describe('sizeFromSku', () => {
  it('strips the article number off the front', () => {
    expect(sizeFromSku('CKGD-0871-WHBL-0-3M', 'CKGD-0871-WHBL')).toBe('0-3M');
  });

  it('falls back to a known suffix when the article does not match', () => {
    expect(sizeFromSku('SOMETHING-ELSE-XXL', 'OTHER')).toBe('XXL');
  });

  it('prefers the longest suffix, so XXL is not read as L', () => {
    expect(sizeFromSku('ART-XXL')).toBe('XXL');
  });

  it('returns nothing rather than inventing a size', () => {
    expect(sizeFromSku('PLAINSKU')).toBe('');
  });
});

describe('normaliseRows', () => {
  const base = { sku: 'A-S', articleNumber: 'A', name: 'Dress', mrp: '999' };

  it('groups sizes of one article and colour into a single product', () => {
    const products = normaliseRows([
      row({ ...base, sku: 'A-S', size: 'S', colorName: 'Navy' }, 4),
      row({ ...base, sku: 'A-M', size: 'M', colorName: 'Navy' }, 5),
    ]);
    expect(products).toHaveLength(1);
    expect(products[0].variants.map((v) => v.size)).toEqual(['S', 'M']);
  });

  it('splits colours of one article into separate products', () => {
    // They are sold, photographed and shown as separate things.
    const products = normaliseRows([
      row({ ...base, sku: 'A-NAVY-S', size: 'S', colorName: 'Navy' }),
      row({ ...base, sku: 'A-WHITE-S', size: 'S', colorName: 'White' }),
    ]);
    expect(products).toHaveLength(2);
  });

  it('creates a category it has never seen instead of refusing the row', () => {
    const products = normaliseRows([row({ ...base, category: 'Pinafores' })]);
    expect(products[0].category).toBe('Pinafores');
    expect(products[0].issues.map((i) => i.code)).not.toContain('no_category');
  });

  it('warns when there is no category at all, but still imports', () => {
    const products = normaliseRows([row(base)]);
    expect(products).toHaveLength(1);
    expect(products[0].issues.map((i) => i.code)).toContain('no_category');
  });

  it('files a blank colour as Assorted rather than dropping the row', () => {
    const products = normaliseRows([row(base)]);
    expect(products[0].colorName).toBe('Assorted');
    expect(products[0].issues.map((i) => i.code)).toContain('color_defaulted');
  });

  it('falls back to the prominent colour when the brand colour is blank', () => {
    const products = normaliseRows([row({ ...base, primaryColor: 'Blue' })]);
    expect(products[0].colorName).toBe('Blue');
    expect(products[0].issues.map((i) => i.code)).toContain('color_from_prominent');
  });

  it('reads the size out of the SKU when there is no size column', () => {
    const products = normaliseRows([row({ ...base, sku: 'A-XL', articleNumber: 'A' })]);
    expect(products[0].variants[0].size).toBe('XL');
    expect(products[0].issues.map((i) => i.code)).toContain('size_from_sku');
  });

  it('uses MRP as the price when no selling price is given', () => {
    expect(normaliseRows([row(base)])[0].price).toBe(999);
  });

  it('prefers an explicit selling price', () => {
    expect(normaliseRows([row({ ...base, sellingPrice: '799' })])[0].price).toBe(799);
  });

  it('warns when the selling price is above MRP', () => {
    const products = normaliseRows([row({ ...base, sellingPrice: '1299' })]);
    expect(products[0].issues.map((i) => i.code)).toContain('price_above_mrp');
  });

  it('starts stock at zero when the sheet has no stock column, and says so', () => {
    const products = normaliseRows([row(base)]);
    expect(products[0].variants[0].stock).toBe(0);
    expect(products[0].issues.map((i) => i.code)).toContain('stock_defaulted');
  });

  it('honours an explicit zero without warning about it', () => {
    const products = normaliseRows([row({ ...base, stock: '0' })]);
    expect(products[0].issues.map((i) => i.code)).not.toContain('stock_defaulted');
  });

  it('refuses only what nobody can guess', () => {
    const noName = row({ sku: 'A-S', mrp: '999' });
    const noPrice = row({ sku: 'B-S', name: 'Dress' });
    const products = normaliseRows([noName, noPrice]);
    expect(products).toHaveLength(0);
    expect(noName.issues[0].code).toBe('no_name');
    expect(noPrice.issues[0].code).toBe('no_price');
  });

  it('reports a repeated SKU rather than silently keeping one', () => {
    const second = row({ ...base, size: 'S' }, 5);
    normaliseRows([row({ ...base, size: 'S' }, 4), second]);
    expect(second.issues[0].code).toBe('duplicate_sku');
  });

  it('says a warning once per product, not once per size', () => {
    const products = normaliseRows([
      row({ ...base, sku: 'A-S', size: 'S' }, 4),
      row({ ...base, sku: 'A-M', size: 'M' }, 5),
      row({ ...base, sku: 'A-L', size: 'L' }, 6),
    ]);
    const defaulted = products[0].issues.filter((i) => i.code === 'color_defaulted');
    expect(defaulted).toHaveLength(1);
  });

  it('keeps attributes that have a value and drops the NA ones', () => {
    const products = normaliseRows([
      row({ ...base, occasion: 'Casual', neckType: 'V-Neck', closure: 'NA' }),
    ]);
    expect(products[0].attributes).toEqual({ Occasion: 'Casual', Neck: 'V-Neck' });
  });
});

describe('sizeChartFrom', () => {
  it('builds a chart from the measurements on each size', () => {
    const products = normaliseRows([
      row(
        {
          sku: 'A-S', articleNumber: 'A', name: 'D', mrp: '999', size: 'S',
          measureChest: '18.5', measureWaist: '16',
        },
        4
      ),
      row(
        {
          sku: 'A-M', articleNumber: 'A', name: 'D', mrp: '999', size: 'M',
          measureChest: '19.5', measureWaist: '17',
        },
        5
      ),
    ]);
    expect(sizeChartFrom(products[0].variants).split('\n')).toEqual([
      'Size · Chest (in) · Waist (in)',
      'S · 18.5 · 16',
      'M · 19.5 · 17',
    ]);
  });

  it('leaves out a measurement the sheet never carried', () => {
    const products = normaliseRows([
      row({ sku: 'A-S', articleNumber: 'A', name: 'D', mrp: '999', size: 'S', measureChest: '18' }),
    ]);
    expect(sizeChartFrom(products[0].variants)).toBe('Size · Chest (in)\nS · 18');
  });

  it('returns nothing when there are no measurements at all', () => {
    const products = normaliseRows([row({ sku: 'A-S', articleNumber: 'A', name: 'D', mrp: '999' })]);
    expect(sizeChartFrom(products[0].variants)).toBe('');
  });
});

describe('titleCase', () => {
  it('tidies a category taken straight from a sheet', () => {
    expect(titleCase('KIDS GIRLS')).toBe('Kids Girls');
  });
});
