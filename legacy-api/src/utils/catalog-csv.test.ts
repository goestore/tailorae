import { csvCell, parseCatalogCsv, parseCsv, slugify, toCsv } from '@/utils/catalog-csv';

/**
 * The importer is the one place a seller hands over their whole catalogue at
 * once, so a parsing mistake is not one bad row — it is three hundred products
 * created wrong, or a stock column silently zeroed.
 */

describe('parseCsv', () => {
  it('reads a plain sheet', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps commas inside quoted fields', () => {
    // The failure this prevents: every description with a comma in it shifting
    // all the columns after it by one.
    expect(parseCsv('name,description\nPolo,"Soft, breathable"')).toEqual([
      ['name', 'description'],
      ['Polo', 'Soft, breathable'],
    ]);
  });

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsv('a\n"one\ntwo"')).toEqual([['a'], ['one\ntwo']]);
  });

  it('reads a doubled quote as one quote', () => {
    expect(parseCsv('a\n"He said ""hi"""')).toEqual([['a'], ['He said "hi"']]);
  });

  it('accepts CRLF, and does not emit a blank row per line ending', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('drops the byte-order mark Excel writes', () => {
    expect(parseCsv('﻿sku,name\nA1,Polo')[0][0]).toBe('sku');
  });

  it('reads a last row with no trailing newline', () => {
    expect(parseCsv('a\n1')).toEqual([['a'], ['1']]);
  });

  it('ignores rows that are entirely empty', () => {
    expect(parseCsv('a,b\n1,2\n,\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseCatalogCsv', () => {
  const header = 'sku,name,price,category,color,size,variantQuantity';

  it('refuses a file with no required columns rather than importing nothing', () => {
    const result = parseCatalogCsv('name,price\nPolo,499');
    expect(result.products).toHaveLength(0);
    expect(result.errors[0].message).toContain('sku');
  });

  it('builds one product from a single row', () => {
    const { products, errors } = parseCatalogCsv(`${header}\nP1,Polo,499,Men,,,`);
    expect(errors).toEqual([]);
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ sku: 'P1', name: 'Polo', price: 499, category: 'Men' });
    expect(products[0].variants).toEqual([]);
  });

  it('groups repeated rows into one product with its variants', () => {
    const csv = [
      header,
      'P1,Polo,499,Men,Navy,S,4',
      'P1,Polo,499,Men,Navy,M,6',
      'P1,Polo,499,Men,White,S,0',
    ].join('\n');
    const { products, errors } = parseCatalogCsv(csv);

    expect(errors).toEqual([]);
    expect(products).toHaveLength(1);
    expect(products[0].variants).toHaveLength(3);
    expect(products[0].variants.map((v) => `${v.color}/${v.size}:${v.quantity}`)).toEqual([
      'Navy/S:4',
      'Navy/M:6',
      'White/S:0',
    ]);
  });

  it('derives a variant SKU when the sheet does not carry one', () => {
    const { products } = parseCatalogCsv(`${header}\nP1,Polo,499,Men,Navy Blue,XL,2`);
    expect(products[0].variants[0].sku).toBe('P1-NAVYBLUE-XL');
  });

  it('keeps a variant SKU the seller supplied', () => {
    const csv = `sku,name,price,color,size,variantSku\nP1,Polo,499,Navy,S,MY-OWN-1`;
    expect(parseCatalogCsv(csv).products[0].variants[0].sku).toBe('MY-OWN-1');
  });

  it('reads prices written the way a spreadsheet exports them', () => {
    const csv = `sku,name,price\nP1,Polo,"₹1,299.50"`;
    expect(parseCatalogCsv(csv).products[0].price).toBe(1299.5);
  });

  it('rejects a product with no price rather than importing it as free', () => {
    const { products, errors } = parseCatalogCsv(`${header}\nP1,Polo,0,Men,,,`);
    expect(products).toHaveLength(0);
    expect(errors[0].message).toContain('price');
  });

  it('rejects an unknown status instead of guessing one', () => {
    const csv = `sku,name,price,status\nP1,Polo,499,LIVE`;
    expect(parseCatalogCsv(csv).errors[0].message).toContain('status');
  });

  it('flags the same colour and size twice in one product', () => {
    const csv = [header, 'P1,Polo,499,Men,Navy,S,4', 'P1,Polo,499,Men,Navy,S,9'].join('\n');
    const { errors } = parseCatalogCsv(csv);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('more than once');
    expect(errors[0].row).toBe(3);
  });

  it('flags a variant SKU shared by two different products', () => {
    const csv = [
      'sku,name,price,color,size,variantSku',
      'P1,Polo,499,Navy,S,SHARED',
      'P2,Tee,299,Navy,S,SHARED',
    ].join('\n');
    expect(parseCatalogCsv(csv).errors[0].message).toContain('already used by');
  });

  it('reports the row number a spreadsheet shows, header included', () => {
    const csv = [header, 'P1,Polo,499,Men,,,', ',Missing,499,Men,,,'].join('\n');
    // Header is row 1, first product row 2, the bad row 3.
    expect(parseCatalogCsv(csv).errors[0].row).toBe(3);
  });

  it('carries on after a bad row rather than abandoning the file', () => {
    const csv = [header, ',NoSku,499,Men,,,', 'P2,Tee,299,Men,,,'].join('\n');
    const { products, errors } = parseCatalogCsv(csv);
    expect(errors).toHaveLength(1);
    expect(products.map((p) => p.sku)).toEqual(['P2']);
  });

  it('names columns it does not understand instead of failing on them', () => {
    const csv = `sku,name,price,supplier_notes\nP1,Polo,499,ignore me`;
    const { products, ignoredColumns } = parseCatalogCsv(csv);
    expect(ignoredColumns).toEqual(['supplier_notes']);
    expect(products).toHaveLength(1);
  });

  it('matches a header whatever case it is written in', () => {
    const csv = `SKU,Name,Price\nP1,Polo,499`;
    expect(parseCatalogCsv(csv).products[0].sku).toBe('P1');
  });

  it('treats the same SKU in different cases as one product', () => {
    const csv = [header, 'p1,Polo,499,Men,Navy,S,4', 'P1,Polo,499,Men,Navy,M,2'].join('\n');
    expect(parseCatalogCsv(csv).products).toHaveLength(1);
  });
});

describe('slugify', () => {
  it('makes a URL-safe slug', () => {
    expect(slugify("Men's Polo T-Shirt")).toBe('mens-polo-t-shirt');
  });

  it('never returns an empty slug', () => {
    expect(slugify('!!!')).toBe('product');
  });
});

describe('toCsv', () => {
  it('quotes only the cells that need it', () => {
    expect(toCsv(['a', 'b'], [['plain', 'has, comma']])).toBe('a,b\nplain,"has, comma"');
  });

  it('escapes quotes by doubling them, so the file reads back the same', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('writes an empty cell for a missing value', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});
