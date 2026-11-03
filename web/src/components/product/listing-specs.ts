import type { ProductDetail, ProductVariant } from '@/types';

/**
 * Turning a product's marketplace listing data into what a shopper reads.
 *
 * Attributes arrive keyed by the catalogue's own keys (`fabric`, `neck`,
 * `printOrPatternType`). The storefront does not call the admin catalogue to
 * label them: the common ones are named here, and anything else is the key
 * made readable.
 */

const ATTRIBUTE_LABELS: Record<string, string> = {
  fabric: 'Fabric',
  fabric2: 'Fabric 2',
  fabric3: 'Fabric 3',
  topFabric: 'Top fabric',
  bottomFabric: 'Bottom fabric',
  fabricType: 'Fabric type',
  knitOrWoven: 'Knit or woven',
  shape: 'Shape',
  fit: 'Fit',
  neck: 'Neck',
  collar: 'Collar',
  sleeveLength: 'Sleeve length',
  sleeveStyling: 'Sleeve styling',
  length: 'Length',
  pattern: 'Pattern',
  printOrPatternType: 'Print or pattern',
  occasion: 'Occasion',
  closure: 'Closure',
  bottomClosure: 'Bottom closure',
  washCare: 'Wash care',
  hemline: 'Hemline',
  lining: 'Lining',
  transparency: 'Transparency',
  surfaceStyling: 'Surface styling',
  addOns: 'Add-ons',
  numberOfPockets: 'Pockets',
  whereToWear: 'Where to wear',
  styleTip: 'Style tip',
  careForMe: 'Care',
};

/** Shown first, in this order; the rest follow in the order they were stored. */
const LEADING: Array<{ label: string; keys: string[] }> = [
  { label: 'Fabric', keys: ['fabric', 'topFabric'] },
  { label: 'Fit', keys: ['fit', 'shape'] },
  { label: 'Neck', keys: ['neck', 'collar'] },
  { label: 'Sleeve length', keys: ['sleeveLength'] },
  { label: 'Length', keys: ['length'] },
  { label: 'Pattern', keys: ['pattern', 'printOrPatternType', 'topPattern'] },
  { label: 'Occasion', keys: ['occasion'] },
  { label: 'Closure', keys: ['closure', 'bottomClosure'] },
  { label: 'Wash care', keys: ['washCare'] },
];

/** Internal or marketing fields a shopper has no use for in a spec table. */
const HIDDEN = new Set([
  'bodyShapeId',
  'mainTrend',
  'theme',
  'theme1',
  'sustainable',
  'character',
  'collectionName',
  'contactBrandOrRetailerForPreSalesProductQueries',
  'stitch',
]);

/** `printOrPatternType` → "Print or pattern type". */
export const humaniseKey = (key: string): string =>
  key
    .replace(/In$/, '')
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/ ([A-Z])(?=[a-z])/g, (m) => m.toLowerCase());

const usable = (value: unknown): value is string | number =>
  (typeof value === 'string' && value.trim() !== '' && !/^(na|n\/a|-)$/i.test(value.trim())) ||
  (typeof value === 'number' && Number.isFinite(value));

/** Myntra's "Kids-Girls" reads as "Girls", "Adults-Women" as "Women". */
const idealForLabel = (ageGroup: string | null | undefined): string | null => {
  if (!ageGroup?.trim()) return null;
  const who = ageGroup.split('-').pop()!.trim();
  return who || null;
};

/**
 * A category field's value as read: a list joined ("HDMI, USB"), a number with
 * its unit ("55 inch"). Anything else unchanged.
 */
const withUnits = (attributes: Record<string, unknown>, units: Record<string, string> = {}) =>
  Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => {
      const text = Array.isArray(value)
        ? value.filter((v) => usable(v)).join(', ')
        : value;
      return [key, units[key] && usable(text) ? `${text} ${units[key]}` : text];
    })
  );

/** Specification rows from the listing data, after the fixed SKU/brand/category rows. */
export function listingSpecRows(product: ProductDetail): Array<[string, string]> {
  const attrs = withUnits(
    (product.attributes ?? {}) as Record<string, unknown>,
    product.listing?.attributeUnits
  );
  const rows: Array<[string, string]> = [];
  const used = new Set<string>();
  const idealFor = idealForLabel(product.ageGroup);
  if (idealFor) rows.push(['Ideal for', idealFor]);

  // Shoes, electronics, home goods: their template names and orders the
  // attributes (upper material, warranty), so the table follows it rather
  // than the clothing order below.
  const labels = product.listing?.attributeLabels;
  if (product.listing?.family === 'general' && labels) {
    for (const [key, label] of Object.entries(labels)) {
      if (!usable(attrs[key])) continue;
      const value = String(attrs[key]);
      rows.push([label, /months\)$/i.test(label) ? `${value} months` : value]);
      used.add(key);
    }
  }

  for (const { label, keys } of product.listing?.family === 'general' ? [] : LEADING) {
    const key = keys.find((k) => usable(attrs[k]));
    if (key) {
      // A dress's "Jumper Dress" is its shape, not its fit.
      rows.push([key === keys[0] ? label : (ATTRIBUTE_LABELS[key] ?? label), String(attrs[key])]);
      keys.forEach((k) => used.add(k));
    } else if (label === 'Fabric' && usable(product.material)) {
      rows.push([label, String(product.material)]);
    }
  }

  for (const [key, value] of Object.entries(attrs)) {
    if (used.has(key) || HIDDEN.has(key) || !usable(value)) continue;
    rows.push([labels?.[key] ?? ATTRIBUTE_LABELS[key] ?? humaniseKey(key), String(value)]);
  }

  if (usable(product.materialCare)) rows.push(['Material & care', product.materialCare!]);
  if (usable(product.sizeAndFit)) rows.push(['Size & fit', product.sizeAndFit!]);
  if (product.countriesOfOrigin?.length) {
    rows.push(['Country of origin', product.countriesOfOrigin.join(', ')]);
  }
  if (product.netQuantity) {
    rows.push(['Net quantity', `${product.netQuantity} ${product.netQuantityUnit ?? ''}`.trim()]);
  }
  if (usable(product.packageContains)) rows.push(['Package contains', product.packageContains!]);
  return rows;
}

/** Manufacturer, packer and importer — required on an Indian listing by Legal Metrology rules. */
export function legalDisclosure(product: ProductDetail): Array<[string, string]> {
  return (
    [
      ['Manufacturer', product.manufacturerDetails],
      ['Packer', product.packerDetails],
      ['Importer', product.importerDetails],
    ] as Array<[string, string | null | undefined]>
  ).filter((entry): entry is [string, string] => usable(entry[1]));
}

/* ── Size chart from per-size measurements ─────────────────────────── */

const MEASUREMENT_LABELS: Record<string, string> = {
  bustIn: 'Bust',
  chestIn: 'Chest',
  waistIn: 'Waist',
  hipsIn: 'Hips',
  frontLengthIn: 'Length',
  acrossShoulderIn: 'Shoulder',
  sleeveLengthIn: 'Sleeve',
  toFitBustIn: 'To fit bust',
  toFitWaistIn: 'To fit waist',
  toFitHipIn: 'To fit hip',
  inseamLengthIn: 'Inseam',
  outseamLengthIn: 'Outseam',
};

export interface MeasurementChart {
  columns: Array<{ key: string; label: string }>;
  rows: Array<{ size: string; values: Record<string, number> }>;
}

/** A per-size table of the measurements variants carry, or null when none do. */
export function measurementChart(variants: ProductVariant[] | undefined): MeasurementChart | null {
  const seenSizes = new Set<string>();
  const rows: MeasurementChart['rows'] = [];
  const keys: string[] = [];
  for (const variant of variants ?? []) {
    const measured = variant.measurements;
    if (!measured || typeof measured !== 'object') continue;
    const values: Record<string, number> = {};
    for (const [key, value] of Object.entries(measured)) {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      values[key] = n;
      if (!keys.includes(key)) keys.push(key);
    }
    const size = variant.size || variant.standardSize || variant.sku;
    // Two colours of one size carry the same chart; show the size once.
    if (Object.keys(values).length === 0 || seenSizes.has(size)) continue;
    seenSizes.add(size);
    rows.push({ size, values });
  }
  if (rows.length === 0) return null;
  const order = Object.keys(MEASUREMENT_LABELS);
  keys.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return {
    columns: keys.map((key) => ({ key, label: MEASUREMENT_LABELS[key] ?? humaniseKey(key) })),
    rows,
  };
}
