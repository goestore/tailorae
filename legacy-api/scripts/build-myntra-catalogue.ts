/**
 * Build the listing catalogue from Myntra SKU templates.
 *
 *   npx ts-node scripts/build-myntra-catalogue.ts "D:/MicrosoftEdgedwnld/myntra"
 *
 * Reads every template in the folder, keeps the newest one per article type
 * (by the date in the file name), and writes:
 *   - src/config/myntra-catalogue.json   what the listing form and the
 *     validator use: every column, its group, whether Myntra marks it
 *     mandatory, what kind of input it is, where it is stored, and its
 *     dropdown options;
 *   - assets/myntra-templates/<type>.xlsx   a copy of each template, which the
 *     "Export to Myntra" download fills in.
 *
 * How a template is laid out (verified against the 2026 templates):
 *   row 2 = group (Business / Discoverability / Sizing / Imagery),
 *   row 3 = header, data from row 4. Mandatory headers carry a yellow fill
 *   (indexed colour 43). Dropdown options live in the `masterdata` sheet:
 *   named columns for business fields (Brand, CountryOfOrigin, AgeGroup …),
 *   then `AttributesValueId*` columns that map, in order, onto the
 *   discoverability columns that come after the nine descriptive text columns.
 */
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';

type Group = 'business' | 'discoverability' | 'sizing' | 'imagery';
type Kind = 'text' | 'longtext' | 'select' | 'number' | 'boolean' | 'measurement' | 'image' | 'date';
type Scope = 'product' | 'variant' | 'attribute' | 'measurement' | 'image' | 'ignore';

interface Column {
  key: string;
  header: string;
  label: string;
  group: Group;
  required: boolean;
  kind: Kind;
  scope: Scope;
  /** Product/variant field it is stored in, for scope product/variant. */
  field?: string;
  /** Key into `lists`, for selects. */
  options?: string;
}

/** Columns that map onto a real Product field. Header → field. */
const PRODUCT_FIELDS: Record<string, { field: string; kind?: Kind }> = {
  styleGroupId: { field: 'styleGroupId' },
  // Myntra's link between the colourways of one design. (styleGroupId only
  // ties one style's size rows together, and sheets fill it with a counter.)
  'Color Variant GroupId': { field: 'colourGroupId' },
  vendorArticleNumber: { field: 'sku' },
  vendorArticleName: { field: 'name' },
  brand: { field: 'brand' },
  'Manufacturer Name and Address with Pincode': { field: 'manufacturerDetails', kind: 'longtext' },
  'Packer Name and Address with Pincode': { field: 'packerDetails', kind: 'longtext' },
  'Importer Name and Address with Pincode': { field: 'importerDetails', kind: 'longtext' },
  'Country Of Origin': { field: 'countriesOfOrigin.0' },
  'Country Of Origin2': { field: 'countriesOfOrigin.1' },
  'Country Of Origin3': { field: 'countriesOfOrigin.2' },
  'Country Of Origin4': { field: 'countriesOfOrigin.3' },
  'Country Of Origin5': { field: 'countriesOfOrigin.4' },
  articleType: { field: 'articleType' },
  'Brand Colour (Remarks)': { field: 'brandColour' },
  HSN: { field: 'hsn' },
  MRP: { field: 'originalPrice', kind: 'number' },
  ISP: { field: 'price', kind: 'number' },
  AgeGroup: { field: 'ageGroup' },
  'Prominent Colour': { field: 'primaryColour' },
  'Second Prominent Colour': { field: 'secondaryColour' },
  'Third Prominent Colour': { field: 'tertiaryColour' },
  FashionType: { field: 'fashionType' },
  Usage: { field: 'usage' },
  Year: { field: 'year' },
  season: { field: 'season' },
  'List View Name': { field: 'listViewName' },
  'Product Details': { field: 'description', kind: 'longtext' },
  styleNote: { field: 'styleNote', kind: 'longtext' },
  materialCareDescription: { field: 'materialCare', kind: 'longtext' },
  sizeAndFitDescription: { field: 'sizeAndFit', kind: 'longtext' },
  productDisplayName: { field: 'displayName' },
  tags: { field: 'tags' },
  'Body or Garment Size': { field: 'measurementBasis' },
  'Net Quantity': { field: 'netQuantity', kind: 'number' },
  'Net Quantity Unit': { field: 'netQuantityUnit' },
  'Number of Items': { field: 'numberOfItems' },
  'Multipack Set': { field: 'multipackSet' },
  'Package Contains': { field: 'packageContains' },
  'BIS Expiry Date': { field: 'bisCertificate.expiryDate', kind: 'date' },
  'BIS Certificate Image URL': { field: 'bisCertificate.imageUrl' },
  'BIS Certificate Number': { field: 'bisCertificate.number' },
};

/** Columns that belong to one size, not the style. */
const VARIANT_FIELDS: Record<string, { field: string; kind?: Kind }> = {
  vendorSkuCode: { field: 'sku' },
  SKUCode: { field: 'sku' },
  'Brand Size': { field: 'size' },
  'Standard Size': { field: 'standardSize' },
  'is Standard Size present on Label': { field: 'sizeOnLabel', kind: 'boolean' },
  GTIN: { field: 'gtin' },
};

/** Assigned by Myntra, or bookkeeping that has no meaning here. */
const IGNORED = new Set(['styleId', 'addedDate', 'AI Label']);

/** The descriptive text columns that open the discoverability group. */
const DESCRIPTIVE = new Set([
  'List View Name',
  'Product Details',
  'styleNote',
  'materialCareDescription',
  'sizeAndFitDescription',
  'productDisplayName',
  'tags',
  'addedDate',
  'Color Variant GroupId',
]);

/** masterdata header → template header, for the business dropdowns. */
const BUSINESS_LISTS: Record<string, string[]> = {
  CountryOfOrigin: ['Country Of Origin'],
  CountryOfOrigin2: ['Country Of Origin2'],
  CountryOfOrigin3: ['Country Of Origin3'],
  CountryOfOrigin4: ['Country Of Origin4'],
  CountryOfOrigin5: ['Country Of Origin5'],
  ArticleType: ['articleType'],
  isinbrand: ['is Standard Size present on Label'],
  AgeGroup: ['AgeGroup'],
  Colour: ['Prominent Colour'],
  Colour1: ['Second Prominent Colour'],
  Colour2: ['Third Prominent Colour'],
  FashionType: ['FashionType'],
  Usage: ['Usage'],
  Year: ['Year'],
  Season: ['season'],
};

const GROUP_OF = (raw: string): Group => {
  const word = raw.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (word.startsWith('discover')) return 'discoverability';
  if (word.startsWith('sizing')) return 'sizing';
  if (word.startsWith('imag')) return 'imagery';
  return 'business';
};

const camel = (header: string): string =>
  header
    .replace(/\(\s*inches\s*\)/i, 'In')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      // Acronyms (MRP, HSN, GTIN) become one lower-case word, not "mRP".
      if (i === 0) return /^[A-Z0-9]+$/.test(word) ? word.toLowerCase() : word.charAt(0).toLowerCase() + word.slice(1);
      return /^[A-Z0-9]+$/.test(word) ? word.charAt(0) + word.slice(1).toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join('');

const IMAGE_KEYS: Record<string, string> = {
  'Front Image': 'front',
  'Side Image': 'side',
  'Back Image': 'back',
  'Detail Angle': 'detail',
  'Look Shot Image': 'lookShot',
  'Additional Image 1': 'additional1',
  'Additional Image 2': 'additional2',
};

const LABELS: Record<string, string> = {
  styleGroupId: 'Style group ID',
  'Color Variant GroupId': 'Colour group',
  vendorSkuCode: 'Size SKU',
  vendorArticleNumber: 'Article number',
  vendorArticleName: 'Article name',
  brand: 'Brand',
  articleType: 'Article type',
  'Brand Colour (Remarks)': 'Brand colour',
  ISP: 'Selling price (ISP)',
  AgeGroup: 'Age group',
  FashionType: 'Fashion type',
  season: 'Season',
  styleNote: 'Style note',
  materialCareDescription: 'Material & care',
  sizeAndFitDescription: 'Size & fit',
  productDisplayName: 'Display name',
  tags: 'Tags',
  'is Standard Size present on Label': 'Standard size on label',
};

const label = (header: string): string =>
  LABELS[header] ?? header.replace(/\(\s*Inches\s*\)/i, '(in)').replace(/\s+/g, ' ').trim();

const cellText = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('text' in value) return String(value.text);
    if ('result' in value) return String(value.result ?? '');
  }
  return String(value);
};

/** Newest file wins per article type: the date in the name, then the file name. */
const dateOf = (file: string): string => file.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '0000-00-00';

async function main(): Promise<void> {
  const dir = process.argv[2];
  if (!dir) throw new Error('Usage: build-myntra-catalogue.ts <folder with Myntra templates>');

  const backendRoot = path.resolve(__dirname, '..');
  const assetsDir = path.join(backendRoot, 'assets', 'myntra-templates');
  await fs.mkdir(assetsDir, { recursive: true });

  const files = (await fs.readdir(dir)).filter((f) => /\.xlsx$/i.test(f)).sort();
  const newest = new Map<string, { file: string; date: string }>();

  for (const file of files) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.readFile(path.join(dir, file));
    } catch {
      console.warn(`skip ${file}: unreadable`);
      continue;
    }
    for (const ws of wb.worksheets) {
      if (ws.name.startsWith('__') || ws.name === 'masterdata') continue;
      if (cellText(ws.getCell(3, 1).value).trim() !== 'styleId') continue; // not a template sheet
      const current = newest.get(ws.name);
      const date = dateOf(file);
      // Prefer the newest date; on a tie, the plain file over "…1" / "-PMR" copies.
      if (!current || date > current.date || (date === current.date && file.length < current.file.length)) {
        newest.set(ws.name, { file, date });
      }
    }
  }

  const lists: Record<string, string[]> = {};
  const listKey = (raw: string[]): string => {
    // Myntra's own lists repeat values (Trousers fabric has Leather twice),
    // which gave the form duplicate options and React duplicate keys.
    const values = [...new Set(raw)];
    const key = createHash('sha1').update(values.join('\u0001')).digest('hex').slice(0, 10);
    lists[key] = values;
    return key;
  };

  const articleTypes = [];

  for (const [sheetName, { file }] of [...newest.entries()].sort()) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(dir, file));
    const ws = wb.getWorksheet(sheetName)!;
    const md = wb.getWorksheet('masterdata');

    // masterdata: header → values (each list is one column, values until a blank).
    const mdLists = new Map<string, string[]>();
    const mdAttrOrder: string[] = [];
    if (md) {
      md.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
        const name = cellText(cell.value).trim();
        const values: string[] = [];
        for (let r = 2; r <= md.rowCount; r += 1) {
          const v = cellText(md.getCell(r, col).value).trim();
          if (!v) break;
          values.push(v);
        }
        mdLists.set(name, values);
        if (name.startsWith('AttributesValueId')) mdAttrOrder.push(name);
      });
    }

    const headerRow = ws.getRow(3);
    const groupRow = ws.getRow(2);
    let currentGroup: Group = 'business';
    const columns: Column[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      const header = cellText(cell.value).trim();
      const groupLabel = cellText(groupRow.getCell(col).value);
      if (groupLabel) currentGroup = GROUP_OF(groupLabel);
      const fill = cell.style?.fill as { fgColor?: { indexed?: number } } | undefined;
      const required = fill?.fgColor?.indexed === 43;

      let scope: Scope = 'attribute';
      let field: string | undefined;
      let kind: Kind = 'text';
      let key = camel(header);

      if (IGNORED.has(header)) scope = 'ignore';
      else if (IMAGE_KEYS[header]) {
        scope = 'image';
        kind = 'image';
        key = IMAGE_KEYS[header];
      } else if (currentGroup === 'sizing' || /\(\s*inches\s*\)/i.test(header)) {
        scope = 'measurement';
        kind = 'measurement';
      } else if (VARIANT_FIELDS[header]) {
        scope = 'variant';
        field = VARIANT_FIELDS[header].field;
        kind = VARIANT_FIELDS[header].kind ?? 'text';
      } else if (PRODUCT_FIELDS[header]) {
        scope = 'product';
        field = PRODUCT_FIELDS[header].field;
        kind = PRODUCT_FIELDS[header].kind ?? 'text';
      }

      columns.push({ key, header, label: label(header), group: currentGroup, required, kind, scope, field });
    });

    // Business dropdowns by name.
    for (const [mdName, headers] of Object.entries(BUSINESS_LISTS)) {
      const values = mdLists.get(mdName);
      if (!values?.length) continue;
      for (const header of headers) {
        const column = columns.find((c) => c.header === header);
        if (!column) continue;
        column.options = listKey(values);
        if (column.kind !== 'boolean') column.kind = 'select';
      }
    }
    const sizeList = [...mdLists.entries()].find(([name]) => /^size/i.test(name))?.[1] ?? [];
    const sizesKey = sizeList.length ? listKey(sizeList) : undefined;
    for (const header of ['Brand Size', 'Standard Size']) {
      const column = columns.find((c) => c.header === header);
      if (column && sizesKey) {
        column.options = sizesKey;
        column.kind = 'select';
      }
    }

    // Discoverability dropdowns: in order, after the descriptive columns.
    const dropdownColumns = columns.filter((c) => c.group === 'discoverability' && !DESCRIPTIVE.has(c.header));
    mdAttrOrder.forEach((mdName, i) => {
      const column = dropdownColumns[i];
      const values = mdLists.get(mdName) ?? [];
      if (!column || values.length === 0) return;
      column.options = listKey(values);
      column.kind = 'select';
    });

    // Columns whose header says they are numbers.
    for (const column of columns) {
      if (column.kind === 'text' && /^(Number of|Net Quantity$)/.test(column.header)) column.kind = 'number';
    }

    const slug = sheetName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await fs.copyFile(path.join(dir, file), path.join(assetsDir, `${slug}.xlsx`));

    articleTypes.push({
      articleType: sheetName,
      slug,
      template: `${slug}.xlsx`,
      sourceFile: file,
      sizes: sizesKey,
      columns,
    });
    const req = columns.filter((c) => c.required).length;
    console.log(`${sheetName.padEnd(14)} ${columns.length} columns, ${req} mandatory, from ${file}`);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    note: 'Generated by scripts/build-myntra-catalogue.ts. Do not edit by hand; re-run the script.',
    articleTypes,
    lists,
  };
  const outPath = path.join(backendRoot, 'src', 'config', 'myntra-catalogue.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(out));
  console.log(`wrote ${outPath} (${Object.keys(lists).length} option lists)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
