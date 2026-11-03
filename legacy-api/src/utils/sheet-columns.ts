/**
 * Reading a listing sheet somebody else's system produced.
 *
 * A seller does not retype their catalogue into our columns — they export what
 * they already file with a marketplace and hand us that. Myntra's SKU template
 * is the one that turns up here, and it is nothing like a tidy CSV: 99 columns,
 * a version banner on row 1, a band of section headings on row 2, the real
 * header on row 3, and two extra tabs of instructions and 43,000 rows of
 * reference data.
 *
 * So the header is found rather than assumed, and column names are matched
 * through aliases rather than required to be exact. Anything unrecognised is
 * reported, never guessed at.
 */

/** The fields the importer understands, whatever a sheet calls them. */
export type CanonicalField =
  | 'articleNumber'
  | 'sku'
  | 'name'
  | 'displayName'
  | 'brand'
  | 'category'
  | 'subcategory'
  | 'size'
  | 'standardSize'
  | 'colorName'
  | 'primaryColor'
  | 'secondaryColor'
  | 'colorGroupKey'
  | 'mrp'
  | 'sellingPrice'
  | 'costPrice'
  | 'stock'
  | 'status'
  | 'description'
  | 'shortDescription'
  | 'material'
  | 'fabricCare'
  | 'hsn'
  | 'gtin'
  | 'countryOfOrigin'
  | 'manufacturer'
  | 'packer'
  | 'importer'
  | 'weight'
  | 'metaTitle'
  | 'metaDescription'
  | 'searchKeywords'
  | 'occasion'
  | 'pattern'
  | 'patternType'
  | 'neckType'
  | 'sleeveLength'
  | 'sleeveStyle'
  | 'productLength'
  | 'fit'
  | 'hemline'
  | 'closure'
  | 'lining'
  | 'transparency'
  | 'ageGroup'
  | 'season'
  | 'year'
  | 'packageContains'
  | 'image1'
  | 'image2'
  | 'image3'
  | 'image4'
  | 'image5'
  | 'image6'
  // Per-size measurements: these become the product's size chart.
  | 'measureBust'
  | 'measureChest'
  | 'measureWaist'
  | 'measureHips'
  | 'measureFrontLength'
  | 'measureShoulder'
  | 'measureSleeveLength';

/**
 * Header text, reduced to something matchable.
 *
 * Sheets differ by case, punctuation, units in brackets and stray spaces —
 * "Front Length ( Inches )", "front_length", "FrontLength" are one column.
 */
export function normaliseHeader(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Alias → canonical field.
 *
 * Two families are listed: plain names anyone would write by hand, and the
 * exact names Myntra's template uses. Marked so the next marketplace's sheet
 * can be added without guessing which entries are load-bearing.
 */
const ALIASES: Record<string, CanonicalField> = {};

const alias = (field: CanonicalField, ...names: string[]) => {
  for (const name of names) ALIASES[normaliseHeader(name)] = field;
};

// ── The product a shopper buys, and the SKU beneath it ─────────────────────
// Myntra models one article per colourway, with a SKU per size under it. That
// is exactly our Product/ProductVariant split, so `vendorArticleNumber` groups
// the rows and `vendorSkuCode` identifies each variant.
alias('articleNumber', 'vendorArticleNumber', 'modelNo', 'model number', 'styleCode', 'articleNumber', 'parentSku');
alias('sku', 'vendorSkuCode', 'sku', 'skuCode', 'variantSku', 'childSku');
alias('name', 'vendorArticleName', 'name', 'productName', 'styleId', 'title');
alias('displayName', 'productDisplayName', 'listViewName', 'displayName');
alias('brand', 'brand', 'brandName');
alias('category', 'articleType', 'category', 'productType');
alias('subcategory', 'subCategory', 'subcategory');

// ── Size and colour ────────────────────────────────────────────────────────
alias('size', 'brandSize', 'size');
alias('standardSize', 'standardSize');
alias('colorName', 'brandColourRemarks', 'brandColour', 'brandColor', 'colour', 'color', 'colourName', 'colorName');
alias('primaryColor', 'prominentColour', 'prominentColor', 'primaryColour', 'primaryColor');
alias('secondaryColor', 'secondProminentColour', 'secondProminentColor', 'secondaryColour', 'secondaryColor');
alias('colorGroupKey', 'colorVariantGroupId', 'colourVariantGroupId', 'styleGroupId', 'productGroupKey');

// ── Money and stock ────────────────────────────────────────────────────────
alias('mrp', 'mrp', 'maximumRetailPrice', 'originalPrice', 'comparePrice');
alias('sellingPrice', 'isp', 'sellingPrice', 'price', 'ourPrice');
alias('costPrice', 'costPrice', 'cost');
alias('stock', 'stock', 'quantity', 'qty', 'inventory', 'variantQuantity');
alias('status', 'status', 'isActive', 'active');

// ── Copy ───────────────────────────────────────────────────────────────────
alias('description', 'productDetails', 'description', 'longDescription');
alias('shortDescription', 'styleNote', 'shortDescription', 'sizeAndFitDescription');
alias('material', 'fabric', 'material', 'fabricType');
alias('fabricCare', 'materialCareDescription', 'washCare', 'fabricCare', 'careInstructions');
alias('metaTitle', 'seoTitle', 'metaTitle');
alias('metaDescription', 'seoDescription', 'metaDescription');
alias('searchKeywords', 'tags', 'searchKeywords', 'keywords');

// ── Compliance: legally required on an Indian listing ──────────────────────
alias('hsn', 'hsn', 'hsnCode', 'taxCode');
alias('gtin', 'gtin', 'ean', 'barcode', 'upc');
alias('countryOfOrigin', 'countryOfOrigin');
alias('manufacturer', 'ManufacturerNameandAddresswithPincode', 'manufacturer', 'manufacturerDetails');
alias('packer', 'PackerNameandAddresswithPincode', 'packer');
alias('importer', 'ImporterNameandAddresswithPincode', 'importer');
alias('packageContains', 'packageContains', 'netQuantity', 'numberOfItems');
alias('weight', 'weight', 'netWeight');

// ── Attributes a shopper filters and reads ─────────────────────────────────
alias('occasion', 'occasion', 'usage');
alias('pattern', 'pattern');
alias('patternType', 'printOrPatternType', 'patternType');
alias('neckType', 'neck', 'neckType', 'neckline');
alias('sleeveLength', 'sleeveLength');
alias('sleeveStyle', 'sleeveStyling', 'sleeveStyle');
alias('productLength', 'length', 'productLength');
alias('fit', 'shape', 'fit');
alias('hemline', 'hemline');
alias('closure', 'closure');
alias('lining', 'lining');
alias('transparency', 'transparency');
alias('ageGroup', 'ageGroup');
alias('season', 'season');
alias('year', 'year');

// ── Images ─────────────────────────────────────────────────────────────────
alias('image1', 'frontImage', 'image1', 'image', 'mainImage');
alias('image2', 'backImage', 'image2');
alias('image3', 'sideImage', 'image3');
alias('image4', 'detailAngle', 'image4');
alias('image5', 'lookShotImage', 'image5');
alias('image6', 'additionalImage1', 'image6');

// ── Measurements, per size — these become the size chart ───────────────────
alias('measureBust', 'bustInches', 'bust', 'toFitBustInches');
alias('measureChest', 'chestInches', 'chest');
alias('measureWaist', 'waistInches', 'waist', 'toFitWaistInches');
alias('measureHips', 'hipsInches', 'hips', 'toFitHipInches');
alias('measureFrontLength', 'frontLengthInches', 'frontLength');
alias('measureShoulder', 'acrossShoulderInches', 'acrossShoulder', 'shoulder');
alias('measureSleeveLength', 'sleeveLengthInches');

/** The field a header maps to, or null when nothing recognises it. */
export function fieldForHeader(header: unknown): CanonicalField | null {
  return ALIASES[normaliseHeader(header)] ?? null;
}

/** Every alias, for the mapping screen to offer when a column is unrecognised. */
export const CANONICAL_FIELDS: CanonicalField[] = [
  ...new Set(Object.values(ALIASES)),
].sort() as CanonicalField[];

/**
 * How well a row of cells reads as a header.
 *
 * Counts *distinct* fields so a row of five blank-ish cells that all alias to
 * the same thing does not beat the real header. This is what finds row 3 of a
 * Myntra sheet without hard-coding the number.
 */
export function headerScore(cells: unknown[]): number {
  const seen = new Set<CanonicalField>();
  for (const cell of cells) {
    const field = fieldForHeader(cell);
    if (field) seen.add(field);
  }
  return seen.size;
}

/**
 * The index of the header row within the first `limit` rows.
 *
 * A sheet has to recognise at least three distinct columns to count as a
 * header; below that it is a banner or a stray note, and guessing would map
 * the whole file one row out.
 */
export function findHeaderRow(matrix: unknown[][], limit = 25): number {
  let bestIndex = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(limit, matrix.length); i += 1) {
    const score = headerScore(matrix[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestScore >= 3 ? bestIndex : -1;
}

/**
 * Tabs that are never product rows.
 *
 * Myntra ships `__INSTRUCTIONS` and a `masterdata` tab of 43,000 dropdown
 * values; importing either would be nonsense, and `masterdata` alone would
 * take the parse from milliseconds to minutes.
 */
export const META_SHEET = /^__|instruction|masterdata|dropdown|reference|readme|help|lookup|guideline/i;
