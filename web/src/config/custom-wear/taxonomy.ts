/**
 * Custom Wear taxonomy: categories, colours, sizes and every filter group.
 *
 * ADD / REMOVE A CATEGORY: edit `CUSTOM_WEAR_CATEGORIES` only. The sidebar,
 * the routes, the breadcrumbs, the URL parser and the collection headings all
 * derive from this array.
 *
 * ADD A FILTER TYPE: add the key to `MultiFilterKey` in
 * `src/types/custom-wear.ts`, add an entry to `CUSTOM_WEAR_FILTER_GROUPS`, and
 * add one line to `FILTER_PREDICATES` in `src/lib/custom-wear/filters.ts`.
 */

import type {
  CustomizationLocationId,
  CustomizationMethodId,
  FabricId,
  FilterGroupConfig,
  FilterOption,
  Gender,
  ProductColor,
  ProductSize,
  ProductTypeId,
  SortId,
} from '@/types/custom-wear';

// ============================================
// CATEGORIES (the 15 Custom Wear categories)
// ============================================

export interface CustomWearCategory {
  /** URL value, e.g. `/custom-wear?category=mens-polo`. */
  id: string;
  /** Label inside its gender group in the sidebar. */
  label: string;
  /** Full marketing label used as the page H1. */
  fullLabel: string;
  gender: Exclude<Gender, 'unisex'>;
  productType: ProductTypeId;
  /** Pretty route: `/custom-wear/men/polo-t-shirts`. */
  genderSlug: string;
  typeSlug: string;
}

export interface CustomWearCategoryGroup {
  gender: Exclude<Gender, 'unisex'>;
  genderSlug: string;
  label: string;
  /** Possessive form used in headings, e.g. "Men's" — "Kids" is not "Kids's". */
  possessive: string;
  categories: CustomWearCategory[];
}

const buildCategories = (
  gender: Exclude<Gender, 'unisex'>,
  genderSlug: string,
  possessive: string
): CustomWearCategory[] => {
  const types: Array<{ label: string; typeSlug: string; productType: ProductTypeId; id: string }> = [
    { label: 'Polo T-Shirts', typeSlug: 'polo-t-shirts', productType: 'polo', id: 'polo' },
    { label: 'Round Neck T-Shirts', typeSlug: 'round-neck-t-shirts', productType: 'round-neck', id: 'round-neck' },
    { label: 'Hoodies', typeSlug: 'hoodies', productType: 'hoodie', id: 'hoodies' },
    { label: 'Sweatshirts', typeSlug: 'sweatshirts', productType: 'sweatshirt', id: 'sweatshirts' },
    { label: 'Sports Wear', typeSlug: 'sports-wear', productType: 'sportswear', id: 'sports-wear' },
  ];

  const prefix = gender === 'kids' ? 'kids' : gender === 'men' ? 'mens' : 'womens';

  return types.map((type) => ({
    id: `${prefix}-${type.id}`,
    label: type.label,
    fullLabel: `Customize ${possessive} ${type.label}`,
    gender,
    productType: type.productType,
    genderSlug,
    typeSlug: type.typeSlug,
  }));
};

export const CUSTOM_WEAR_CATEGORY_GROUPS: CustomWearCategoryGroup[] = [
  {
    gender: 'men',
    genderSlug: 'men',
    label: 'Men',
    possessive: "Men's",
    categories: buildCategories('men', 'men', "Men's"),
  },
  {
    gender: 'women',
    genderSlug: 'women',
    label: 'Women',
    possessive: "Women's",
    categories: buildCategories('women', 'women', "Women's"),
  },
  {
    gender: 'kids',
    genderSlug: 'kids',
    label: 'Kids',
    possessive: "Kids'",
    categories: buildCategories('kids', 'kids', "Kid's"),
  },
];

export const CUSTOM_WEAR_CATEGORIES: CustomWearCategory[] =
  CUSTOM_WEAR_CATEGORY_GROUPS.flatMap((group) => group.categories);

export const getCategoryById = (id: string | null): CustomWearCategory | undefined =>
  id ? CUSTOM_WEAR_CATEGORIES.find((category) => category.id === id) : undefined;

export const getCategoryByRoute = (
  genderSlug: string,
  typeSlug?: string
): CustomWearCategory | undefined =>
  CUSTOM_WEAR_CATEGORIES.find(
    (category) => category.genderSlug === genderSlug && (!typeSlug || category.typeSlug === typeSlug)
  );

export const getCategoryGroup = (genderSlug: string): CustomWearCategoryGroup | undefined =>
  CUSTOM_WEAR_CATEGORY_GROUPS.find((group) => group.genderSlug === genderSlug);

/** `/custom-wear/men/polo-t-shirts` for a category, `/custom-wear` for none. */
export const categoryHref = (category?: CustomWearCategory): string =>
  category ? `/custom-wear/${category.genderSlug}/${category.typeSlug}` : '/custom-wear';

// ============================================
// COLOUR LIBRARY
// ============================================

export interface ColorDefinition {
  id: string;
  name: string;
  hex: string;
  secondaryHex?: string;
}

export const CUSTOM_WEAR_COLORS: ColorDefinition[] = [
  { id: 'black', name: 'Black', hex: '#111111' },
  { id: 'white', name: 'White', hex: '#FFFFFF' },
  { id: 'navy', name: 'Navy', hex: '#1B2A4A' },
  { id: 'royal-blue', name: 'Royal Blue', hex: '#1E4FD8' },
  { id: 'sky-blue', name: 'Sky Blue', hex: '#79B8E8' },
  { id: 'red', name: 'Red', hex: '#C7262C' },
  { id: 'maroon', name: 'Maroon', hex: '#6B1B26' },
  { id: 'green', name: 'Green', hex: '#2E8B4A' },
  { id: 'bottle-green', name: 'Bottle Green', hex: '#0F4034' },
  { id: 'grey', name: 'Grey', hex: '#9A9A9A', secondaryHex: '#C7C7C7' },
  { id: 'yellow', name: 'Yellow', hex: '#FBB602' },
  { id: 'orange', name: 'Orange', hex: '#E8701A' },
  { id: 'beige', name: 'Beige', hex: '#DCCDB4' },
  { id: 'pink', name: 'Pink', hex: '#E38AA8' },
  { id: 'purple', name: 'Purple', hex: '#6B3FA0' },
];

export const getColorDefinition = (id: string): ColorDefinition | undefined =>
  CUSTOM_WEAR_COLORS.find((color) => color.id === id);

/** Helper used by the dataset to declare product colours without repeating hex codes. */
export const productColor = (
  id: string,
  overrides: Partial<Omit<ProductColor, 'id'>> = {}
): ProductColor => {
  const definition = getColorDefinition(id);
  return {
    id,
    name: definition?.name ?? id,
    hex: definition?.hex ?? '#CCCCCC',
    secondaryHex: definition?.secondaryHex,
    inStock: true,
    ...overrides,
  };
};

// ============================================
// SIZES
// ============================================

export const ADULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'] as const;

export const KIDS_SIZES = [
  '2-3Y',
  '3-4Y',
  '4-5Y',
  '5-6Y',
  '6-7Y',
  '7-8Y',
  '9-10Y',
  '11-12Y',
  '13-14Y',
  '15-16Y',
] as const;

const KIDS_SIZE_LABELS: Record<string, string> = Object.fromEntries(
  KIDS_SIZES.map((size) => [size, size.replace('-', '–')])
);

export const productSizes = (ids: readonly string[], group: 'adult' | 'kids'): ProductSize[] =>
  ids.map((id) => ({
    id,
    label: group === 'kids' ? KIDS_SIZE_LABELS[id] ?? id : id,
    group,
    inStock: true,
  }));

export const sizeLabel = (id: string): string => KIDS_SIZE_LABELS[id] ?? id;

// ============================================
// OPTION LISTS
// ============================================

export const GENDER_OPTIONS: FilterOption[] = [
  { id: 'men', label: 'Men' },
  { id: 'women', label: 'Women' },
  { id: 'kids', label: 'Kids' },
  { id: 'unisex', label: 'Unisex' },
];

export const PRODUCT_TYPE_OPTIONS: FilterOption[] = [
  { id: 'polo', label: 'Polo' },
  { id: 'round-neck', label: 'Round Neck' },
  { id: 'hoodie', label: 'Hoodie' },
  { id: 'sweatshirt', label: 'Sweatshirt' },
  { id: 'sportswear', label: 'Sportswear' },
];

export const FABRIC_OPTIONS: FilterOption[] = [
  { id: 'cotton-100', label: '100% Cotton' },
  { id: 'cotton-blend', label: 'Cotton Blend' },
  { id: 'polyester', label: 'Polyester' },
  { id: 'performance-polyester', label: 'Performance Polyester' },
  { id: 'dry-fit', label: 'Dry Fit' },
  { id: 'organic-cotton', label: 'Organic Cotton' },
  { id: 'recycled-polyester', label: 'Recycled Polyester' },
];

export const FABRIC_LABELS: Record<FabricId, string> = {
  'cotton-100': '100% Cotton',
  'cotton-blend': 'Cotton Blend',
  polyester: 'Polyester',
  'performance-polyester': 'Performance Polyester',
  'dry-fit': 'Dry Fit',
  'organic-cotton': 'Organic Cotton',
  'recycled-polyester': 'Recycled Polyester',
};

/** GSM buckets. `min` inclusive, `max` exclusive (`null` = open ended). */
export const GSM_BUCKETS: Array<{ id: string; label: string; min: number; max: number | null }> = [
  { id: 'under-160', label: 'Under 160 GSM', min: 0, max: 160 },
  { id: '160-180', label: '160–180 GSM', min: 160, max: 180 },
  { id: '180-200', label: '180–200 GSM', min: 180, max: 200 },
  { id: '200-240', label: '200–240 GSM', min: 200, max: 240 },
  { id: '240-plus', label: '240+ GSM', min: 240, max: null },
];

export const CUSTOMIZATION_METHOD_OPTIONS: Array<{ id: CustomizationMethodId; label: string; description: string }> = [
  { id: 'screen-printing', label: 'Screen Printing', description: 'Best value for large runs with few colours.' },
  { id: 'dtg', label: 'DTG Printing', description: 'Full-colour detail, ideal for small quantities.' },
  { id: 'dtf', label: 'DTF Printing', description: 'Vivid transfers that work on blends and synthetics.' },
  { id: 'sublimation', label: 'Sublimation', description: 'All-over graphics on light polyester.' },
  { id: 'heat-transfer', label: 'Heat Transfer', description: 'Fast turnaround for names and numbers.' },
  { id: 'embroidery', label: 'Embroidery', description: 'Premium stitched finish for logos and crests.' },
  { id: 'puff-printing', label: 'Puff Printing', description: 'Raised 3D texture for statement artwork.' },
  { id: 'vinyl-printing', label: 'Vinyl Printing', description: 'Durable single-colour names and numbers.' },
];

export const CUSTOMIZATION_METHOD_LABELS: Record<CustomizationMethodId, string> = Object.fromEntries(
  CUSTOMIZATION_METHOD_OPTIONS.map((option) => [option.id, option.label])
) as Record<CustomizationMethodId, string>;

export const CUSTOMIZATION_LOCATION_OPTIONS: Array<{
  id: CustomizationLocationId;
  label: string;
  side: 'front' | 'back' | 'sleeve';
}> = [
  { id: 'left-chest', label: 'Left Chest', side: 'front' },
  { id: 'right-chest', label: 'Right Chest', side: 'front' },
  { id: 'centre-front', label: 'Centre Front', side: 'front' },
  { id: 'full-front', label: 'Full Front', side: 'front' },
  { id: 'upper-back', label: 'Upper Back', side: 'back' },
  { id: 'full-back', label: 'Full Back', side: 'back' },
  { id: 'left-sleeve', label: 'Left Sleeve', side: 'sleeve' },
  { id: 'right-sleeve', label: 'Right Sleeve', side: 'sleeve' },
];

export const CUSTOMIZATION_LOCATION_LABELS: Record<CustomizationLocationId, string> = Object.fromEntries(
  CUSTOMIZATION_LOCATION_OPTIONS.map((option) => [option.id, option.label])
) as Record<CustomizationLocationId, string>;

/** MOQ buckets. A product matches when its MOQ is at or below the threshold. */
export const MOQ_BUCKETS: Array<{ id: string; label: string; max: number }> = [
  { id: 'no-moq', label: 'No MOQ', max: 1 },
  { id: '10-plus', label: '10+', max: 10 },
  { id: '25-plus', label: '25+', max: 25 },
  { id: '50-plus', label: '50+', max: 50 },
  { id: '100-plus', label: '100+', max: 100 },
  { id: '250-plus', label: '250+', max: 250 },
  { id: '500-plus', label: '500+', max: 500 },
];

export const SORT_OPTIONS: Array<{ id: SortId; label: string }> = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'popular', label: 'Popular' },
  { id: 'newest', label: 'Newest' },
  { id: 'price-asc', label: 'Price: Low to High' },
  { id: 'price-desc', label: 'Price: High to Low' },
  { id: 'rating', label: 'Best Rated' },
];

export const BADGE_LABELS: Record<string, string> = {
  new: 'New',
  bestseller: 'Bestseller',
  premium: 'Premium',
  'eco-friendly': 'Eco Friendly',
  'no-moq': 'No MOQ',
  'new-options': 'New Options',
};

// ============================================
// FILTER GROUPS (sidebar order = array order)
// ============================================

export const CUSTOM_WEAR_FILTER_GROUPS: FilterGroupConfig[] = [
  {
    key: 'gender',
    title: 'Gender',
    control: 'checkbox',
    options: GENDER_OPTIONS,
    defaultOpen: true,
  },
  {
    key: 'productType',
    title: 'Product Type',
    control: 'checkbox',
    options: PRODUCT_TYPE_OPTIONS,
    defaultOpen: true,
  },
  {
    key: 'color',
    title: 'Colour',
    control: 'swatch',
    options: CUSTOM_WEAR_COLORS.map((color) => ({
      id: color.id,
      label: color.name,
      hex: color.hex,
      secondaryHex: color.secondaryHex,
    })),
    defaultOpen: true,
  },
  {
    key: 'size',
    title: 'Size',
    control: 'chip',
    options: [
      ...ADULT_SIZES.map((size) => ({ id: size, label: size, group: 'adult' as const })),
      ...KIDS_SIZES.map((size) => ({ id: size, label: sizeLabel(size), group: 'kids' as const })),
    ],
    defaultOpen: true,
    collapseAfter: 9,
  },
  {
    key: 'fabric',
    title: 'Fabric',
    control: 'checkbox',
    options: FABRIC_OPTIONS,
  },
  {
    key: 'gsm',
    title: 'GSM',
    control: 'checkbox',
    options: GSM_BUCKETS.map(({ id, label }) => ({ id, label })),
  },
  {
    key: 'method',
    title: 'Customization Method',
    control: 'checkbox',
    options: CUSTOMIZATION_METHOD_OPTIONS.map(({ id, label }) => ({ id, label })),
    collapseAfter: 5,
  },
  {
    key: 'location',
    title: 'Customization Location',
    control: 'checkbox',
    options: CUSTOMIZATION_LOCATION_OPTIONS.map(({ id, label }) => ({ id, label })),
    collapseAfter: 5,
  },
  {
    key: 'moq',
    title: 'Minimum Order Quantity',
    control: 'checkbox',
    options: MOQ_BUCKETS.map(({ id, label }) => ({ id, label })),
  },
];

export const getFilterGroup = (key: string): FilterGroupConfig | undefined =>
  CUSTOM_WEAR_FILTER_GROUPS.find((group) => group.key === key);

export const getFilterOptionLabel = (key: string, id: string): string => {
  const group = getFilterGroup(key);
  return group?.options.find((option) => option.id === id)?.label ?? id;
};

export const PAGE_SIZE = 24;
