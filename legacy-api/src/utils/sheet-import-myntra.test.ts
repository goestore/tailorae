import {
  missingForLiveOf,
  normaliseRows,
  parseSheet,
  sanitiseListing,
  sizeChartFrom,
} from '@/utils/sheet-import';

/**
 * A Myntra template is read through the generated catalogue: every column by
 * its exact header, landing on the product, an attribute, a size, a
 * measurement or an image angle. Nothing a seller filled in is dropped.
 */

// The real Dresses header (row 3 of the template), cut to the columns these
// tests exercise, after Myntra's banner and section rows.
const header = [
  'styleGroupId', 'vendorSkuCode', 'vendorArticleNumber', 'vendorArticleName', 'brand',
  'Manufacturer Name and Address with Pincode', 'Packer Name and Address with Pincode',
  'Importer Name and Address with Pincode', 'Country Of Origin', 'Country Of Origin2', 'articleType',
  'Brand Size', 'Standard Size', 'is Standard Size present on Label', 'Brand Colour (Remarks)', 'GTIN',
  'HSN', 'MRP', 'ISP', 'AgeGroup', 'Prominent Colour', 'Second Prominent Colour', 'Third Prominent Colour',
  'Year', 'season', 'Product Details', 'materialCareDescription', 'tags', 'Fabric', 'Neck', 'Closure',
  'Net Quantity', 'Bust ( Inches )', 'Front Length ( Inches )', 'Front Image', 'Back Image',
  'Additional Image 2',
];

const line = (size: string, bust: string, extra: Record<string, string> = {}) => {
  const base: Record<string, string> = {
    styleGroupId: '7', vendorSkuCode: `CK-1-${size}`, vendorArticleNumber: 'CK-1',
    vendorArticleName: 'Girls Floral Dress', brand: 'Creative Kids',
    'Manufacturer Name and Address with Pincode': 'Maker, Gurugram 122001',
    'Packer Name and Address with Pincode': 'Packer, Gurugram 122001',
    'Importer Name and Address with Pincode': '',
    'Country Of Origin': 'india', 'Country Of Origin2': '', articleType: 'Dresses',
    'Brand Size': size, 'Standard Size': size, 'is Standard Size present on Label': 'Yes',
    'Brand Colour (Remarks)': 'Pink', GTIN: '', HSN: '62044390', MRP: '999', ISP: '499',
    AgeGroup: 'Kids-Girls', 'Prominent Colour': 'Pink', 'Second Prominent Colour': 'Blue',
    'Third Prominent Colour': 'White', Year: '2026', season: 'Summer',
    'Product Details': 'A floral dress.', materialCareDescription: 'Machine Wash',
    tags: 'floral, summer', Fabric: 'polyester', Neck: 'Round Neck', Closure: 'NA',
    'Net Quantity': '1', 'Bust ( Inches )': bust, 'Front Length ( Inches )': '20',
    'Front Image': 'https://img.example/front.jpg', 'Back Image': 'https://img.example/back.jpg',
    'Additional Image 2': 'https://img.example/extra2.jpg',
  };
  const values: Record<string, string> = { ...base, ...extra };
  return header.map((h) => JSON.stringify(values[h] ?? '')).join(',');
};

const csv = (...rows: string[]) =>
  Buffer.from(
    ['"Version : 13"', '"Business"', header.map((h) => JSON.stringify(h)).join(','), ...rows].join('\n')
  );

const read = async (...rows: string[]) => {
  const parsed = await parseSheet(csv(...rows), 'dresses.csv');
  return { parsed, products: normaliseRows(parsed.rows) };
};

describe('a Myntra template, read through the catalogue', () => {
  it('recognises the article type and keeps every catalogue column', async () => {
    const { parsed, products } = await read(line('S', '30'), line('M', '32'));
    expect(parsed.articleType).toBe('Dresses');
    expect(parsed.unmapped).toEqual([]);
    expect(products).toHaveLength(1);
    const [dress] = products;
    expect(dress.articleType).toBe('Dresses');
    expect(dress.listing).toMatchObject({
      styleGroupId: '7',
      hsn: '62044390',
      countriesOfOrigin: ['India'],
      manufacturerDetails: 'Maker, Gurugram 122001',
      packerDetails: 'Packer, Gurugram 122001',
      ageGroup: 'Kids-Girls',
      primaryColour: 'Pink',
      secondaryColour: 'Blue',
      tertiaryColour: 'White',
      year: 2026,
      materialCare: 'Machine Wash',
      tags: ['floral', 'summer'],
      netQuantity: 1,
    });
    expect(dress.listing.importerDetails).toBeUndefined();
  });

  it('stores attributes by catalogue key, normalised, and keeps them out of the description', async () => {
    const { products } = await read(line('S', '30'));
    // "NA" is one of Myntra's own Closure options, so it is kept as written.
    expect(products[0].attributes).toEqual({ fabric: 'Polyester', neck: 'Round Neck', closure: 'NA' });
    expect(products[0].description).toBe('A floral dress.');
  });

  it('keeps image angles, gallery in angle order, including additional image 2', async () => {
    const { products } = await read(line('S', '30'));
    expect(products[0].imageAngles).toEqual({
      front: 'https://img.example/front.jpg',
      back: 'https://img.example/back.jpg',
      additional2: 'https://img.example/extra2.jpg',
    });
    expect(products[0].images).toEqual([
      'https://img.example/front.jpg',
      'https://img.example/back.jpg',
      'https://img.example/extra2.jpg',
    ]);
  });

  it('keeps per-size standard size, label flag, GTIN and measurements', async () => {
    const { products } = await read(line('S', '30', { GTIN: '8901234567890' }), line('M', '32.5'));
    const [s, m] = products[0].variants;
    expect(s).toMatchObject({ sku: 'CK-1-S', size: 'S', standardSize: 'S', sizeOnLabel: true, gtin: '8901234567890' });
    expect(s.measurementValues).toEqual({ bustIn: 30, frontLengthIn: 20 });
    expect(m.measurementValues).toEqual({ bustIn: 32.5, frontLengthIn: 20 });
    // The text size chart is still generated for the storefront's fallback.
    expect(sizeChartFrom(products[0].variants)).toContain('Bust (in)');
  });

  it('reads "No" on the size-label column as false', async () => {
    const { products } = await read(line('S', '30', { 'is Standard Size present on Label': 'No' }));
    expect(products[0].variants[0].sizeOnLabel).toBe(false);
  });

  it('reports a value that is not a Myntra option instead of failing the product', async () => {
    const { products } = await read(line('S', '30', { Fabric: 'Moonbeam', GTIN: '12' }));
    expect(products).toHaveLength(1);
    expect(products[0].attributes.fabric).toBeUndefined();
    const messages = products[0].issues.filter((i) => i.code === 'invalid_value').map((i) => i.message);
    expect(messages.some((m) => m.includes('Moonbeam'))).toBe(true);
    expect(messages.some((m) => m.includes('GTIN'))).toBe(true);
    expect(products[0].issues.every((i) => i.level === 'warning')).toBe(true);
  });

  it('lists what is still missing before the product may go live', async () => {
    const { products } = await read(line('S', '30'));
    const missing = missingForLiveOf(products[0]).map((m) => m.key);
    // GTIN is optional to go live: small brands often have no barcodes.
    expect(missing).not.toContain('gtin');
    expect(missing).toContain('knitOrWoven');
    expect(missing).not.toContain('hsn');
    expect(missing).not.toContain('front');
  });

  it('is idempotent, so the commit can re-check what the browser sends back', async () => {
    const { products } = await read(line('S', '30'));
    const again = sanitiseListing('Dresses', products[0].listing, products[0].attributes);
    expect(again.product).toEqual(products[0].listing);
    expect(again.attributes).toEqual(products[0].attributes);
    expect(again.issues).toEqual([]);
  });

  it('drops payload fields that are not listing columns', () => {
    const out = sanitiseListing('Dresses', { status: 'ACTIVE', vendorId: 'x', hsn: '6204' });
    expect(out.product).toEqual({ hsn: '6204' });
  });
});

describe('a sheet that is not a known template', () => {
  it('is read the generic way, but no longer drops HSN or country of origin', async () => {
    const parsed = await parseSheet(
      Buffer.from('sku,name,mrp,hsn,Country Of Origin\nA-S,Dress,999,6204,India'),
      'x.csv'
    );
    expect(parsed.articleType).toBeNull();
    const [product] = normaliseRows(parsed.rows);
    expect(product.articleType).toBeNull();
    expect(product.listing).toMatchObject({ hsn: '6204', countriesOfOrigin: ['India'] });
    expect(missingForLiveOf(product)).toEqual([]);
  });
});
