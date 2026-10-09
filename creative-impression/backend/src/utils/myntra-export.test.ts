import ExcelJS from 'exceljs';
import { findArticleType } from '@/utils/product-spec';
import { absoluteUrl, buildMyntraWorkbook, cellFor, type ExportProduct } from '@/utils/myntra-export';

/**
 * The export is the importer in reverse; these pin that each kind of column
 * reads back from where the importer put it.
 */

const dresses = findArticleType('Dresses')!;
const column = (header: string) => dresses.columns.find((c) => c.header === header)!;

const product: ExportProduct = {
  sku: 'CK-1',
  name: 'Girls Floral Dress',
  price: 499,
  originalPrice: 999,
  description: 'A floral dress.',
  articleType: 'Dresses',
  styleGroupId: null,
  hsn: '62044390',
  countriesOfOrigin: ['India', 'Bangladesh'],
  tags: ['floral', 'summer'],
  brand: { name: 'Creative Kids' },
  attributes: { fabric: 'Polyester' },
  imageAngles: { front: '/uploads/products/front.webp', back: 'https://cdn.example/back.jpg' },
  bisCertificate: { number: 'BIS-1' },
  variants: [
    { sku: 'CK-1-S', size: 'S', standardSize: 'S', sizeOnLabel: true, gtin: '8901234567890', measurements: { bustIn: 30 } },
    { sku: 'CK-1-M', size: 'M', price: 549, sizeOnLabel: false, measurements: { bustIn: 32 } },
  ],
};
const [small, medium] = product.variants;
const base = 'https://api.example.com';

describe('cellFor', () => {
  it('writes product, size and price columns', () => {
    expect(cellFor(column('vendorArticleNumber'), product, small, base)).toBe('CK-1');
    expect(cellFor(column('vendorSkuCode'), product, small, base)).toBe('CK-1-S');
    expect(cellFor(column('SKUCode'), product, small, base)).toBe('CK-1-S');
    expect(cellFor(column('brand'), product, small, base)).toBe('Creative Kids');
    expect(cellFor(column('Brand Size'), product, small, base)).toBe('S');
    expect(cellFor(column('MRP'), product, small, base)).toBe(999);
    expect(cellFor(column('ISP'), product, small, base)).toBe(499);
    // A size with its own price override sells at that price.
    expect(cellFor(column('ISP'), product, medium, base)).toBe(549);
    expect(cellFor(column('HSN'), product, small, base)).toBe('62044390');
    expect(cellFor(column('GTIN'), product, small, base)).toBe('8901234567890');
  });

  it('defaults the style group to the article number', () => {
    expect(cellFor(column('styleGroupId'), product, small, base)).toBe('CK-1');
  });

  it('spreads countries across the five columns and joins tags', () => {
    expect(cellFor(column('Country Of Origin'), product, small, base)).toBe('India');
    expect(cellFor(column('Country Of Origin2'), product, small, base)).toBe('Bangladesh');
    expect(cellFor(column('Country Of Origin3'), product, small, base)).toBeNull();
    expect(cellFor(column('tags'), product, small, base)).toBe('floral, summer');
    expect(cellFor(column('BIS Certificate Number'), product, small, base)).toBe('BIS-1');
  });

  it('writes the label flag as Yes or No', () => {
    expect(cellFor(column('is Standard Size present on Label'), product, small, base)).toBe('Yes');
    expect(cellFor(column('is Standard Size present on Label'), product, medium, base)).toBe('No');
  });

  it('writes attributes, measurements and absolute image URLs', () => {
    expect(cellFor(column('Fabric'), product, small, base)).toBe('Polyester');
    expect(cellFor(column('Bust ( Inches )'), product, medium, base)).toBe(32);
    expect(cellFor(column('Front Image'), product, small, base)).toBe(
      'https://api.example.com/uploads/products/front.webp'
    );
    expect(cellFor(column('Back Image'), product, small, base)).toBe('https://cdn.example/back.jpg');
  });

  it('falls back to the gallery when a product has no image angles', () => {
    const legacy = { ...product, imageAngles: null, thumbnail: '/uploads/a.webp', images: ['/uploads/a.webp', '/uploads/b.webp'] };
    expect(cellFor(column('Front Image'), legacy, small, base)).toBe('https://api.example.com/uploads/a.webp');
    expect(cellFor(column('Back Image'), legacy, small, base)).toBe('https://api.example.com/uploads/b.webp');
  });
});

describe('absoluteUrl', () => {
  it('leaves absolute URLs alone', () => {
    expect(absoluteUrl('https://x/y.jpg', base)).toBe('https://x/y.jpg');
  });
});

describe('buildMyntraWorkbook', () => {
  it('writes one row per size under the template header, clearing the sample rows', async () => {
    const { workbook, rows } = await buildMyntraWorkbook(dresses, [product], base);
    expect(rows).toBe(2);
    // Round-trip through bytes, as the download would.
    const buffer = await workbook.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buffer);
    const sheet = back.getWorksheet('Dresses')!;
    const header = sheet.getRow(3);
    const col = (name: string) => {
      for (let c = 1; c <= sheet.columnCount; c += 1) if (header.getCell(c).value === name) return c;
      return -1;
    };
    expect(sheet.getRow(4).getCell(col('vendorSkuCode')).value).toBe('CK-1-S');
    expect(sheet.getRow(5).getCell(col('vendorSkuCode')).value).toBe('CK-1-M');
    expect(sheet.getRow(5).getCell(col('ISP')).value).toBe(549);
    // The template's own sample data is gone.
    expect(sheet.getRow(6).getCell(col('vendorSkuCode')).value).toBeNull();
    expect(back.getWorksheet('masterdata')).toBeDefined();
  }, 60000);
});
