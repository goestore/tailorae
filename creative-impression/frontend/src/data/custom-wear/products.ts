/**
 * Custom Wear sample catalogue.
 *
 * This is the ONLY place product data is declared. No component imports this
 * file directly — everything goes through `src/lib/custom-wear/api.ts`, so
 * swapping to the real product API is a one-file change.
 *
 * ADD A PRODUCT: append a seed to `PRODUCT_SEEDS`. The factory derives the
 * price range, accordion content, size chart and per-colour imagery from the
 * attributes you give it.
 */

import {
  ADULT_SIZES,
  KIDS_SIZES,
  FABRIC_LABELS,
  CUSTOMIZATION_METHOD_LABELS,
  CUSTOMIZATION_LOCATION_LABELS,
  productColor,
  productSizes,
} from '@/config/custom-wear/taxonomy';
import type {
  BadgeId,
  CustomWearProduct,
  CustomizationLocationId,
  CustomizationMethodId,
  FabricId,
  Gender,
  PriceTier,
  ProductDescriptionBlock,
  ProductImage,
  ProductImageRole,
  ProductTypeId,
  SizeChart,
} from '@/types/custom-wear';

// ============================================
// IMAGE LIBRARY (files in /public/images)
// ============================================

/*
 * Product photography only.
 *
 * `Male Model`, `Female Model`, `Banner Customize` and `WINTER` are marketing
 * banners — half of each is a typeset advert panel ("CUSTOMIZE POLO T-SHIRTS",
 * "SMART STYLE BLAZER", "WINTER JACKET"). They were being used as gallery and
 * colour-variant images, so a product tile cropped to a portrait cell showed
 * the ad copy instead of the garment. They stay available to the home page and
 * the hero, where a banner is what is wanted, and are deliberately absent here.
 */
const IMG = {
  mensPolo: '/images/Mens%20Polo%20T-Shirt.webp',
  roundNeck: '/images/Round%20Neck%20T-Shirt.webp',
  mensShirt: '/images/Mens%20Shirt.webp',
  womensPolo: '/images/Women%20Polo%20T-Shirt.webp',
  womensTop: '/images/Women%20Top.webp',
  boysPolo: '/images/Boys%20Polo%20T-Shirts.webp',
} as const;

// ============================================
// SEED SHAPE
// ============================================

interface GallerySeed {
  url: string;
  role: ProductImageRole;
  caption: string;
}

interface ProductSeed {
  id: string;
  slug: string;
  sku: string;
  name: string;
  shortDescription: string;
  description: string;
  gender: Gender;
  category: string;
  productType: ProductTypeId;
  fabric: FabricId;
  fabricComposition: string;
  gsm: number;
  fit: string;
  basePrice: number;
  /** `[minQty, maxQty|null, pricePerUnit]`. Omit to use `standardTiers`. */
  tiers?: Array<[number, number | null, number]>;
  colors: string[];
  /** Per-colour front shot; falls back to the primary image when absent. */
  /**
   * Colour id -> photograph OF THAT COLOUR. Only map a colour when the asset
   * genuinely shows the garment in it; a wrong entry is worse than none,
   * because the gallery presents it as the colour the buyer selected. Anything
   * left unmapped falls back to the generated colour view.
   */
  colorImages?: Record<string, string>;
  sizes: readonly string[];
  sizeGroup: 'adult' | 'kids';
  methods: CustomizationMethodId[];
  locations: CustomizationLocationId[];
  gallery: GallerySeed[];
  rating: number;
  reviewCount: number;
  badges?: BadgeId[];
  minOrderQuantity: number;
  defaultQuantity: number;
  popularity: number;
  createdAt: string;
  highlights: string[];
  careInstructions: string[];
  descriptionBlock: ProductDescriptionBlock;
  relatedProductIds: string[];
}

// ============================================
// DERIVATION HELPERS
// ============================================

/** Volume curve applied when a seed does not declare its own tiers. */
const standardTiers = (base: number): Array<[number, number | null, number]> => [
  [1, 9, base],
  [10, 24, Math.round(base * 0.95)],
  [25, 49, Math.round(base * 0.87)],
  [50, 99, Math.round(base * 0.79)],
  [100, null, Math.round(base * 0.7)],
];

const ADULT_SIZE_CHART: SizeChart = {
  unit: 'cm',
  columns: ['Chest (round)', 'Length', 'Shoulder', 'Sleeve'],
  rows: [
    { size: 'XS', values: ['88', '66', '41', '19'] },
    { size: 'S', values: ['93', '68', '43', '20'] },
    { size: 'M', values: ['98', '70', '45', '21'] },
    { size: 'L', values: ['103', '72', '47', '22'] },
    { size: 'XL', values: ['108', '74', '49', '23'] },
    { size: 'XXL', values: ['113', '76', '51', '24'] },
    { size: '3XL', values: ['118', '78', '53', '25'] },
    { size: '4XL', values: ['123', '80', '55', '26'] },
    { size: '5XL', values: ['128', '82', '57', '27'] },
  ],
  note: 'Garment measured flat and doubled for chest. Allow ±1.5 cm tolerance on bulk production runs.',
};

const KIDS_SIZE_CHART: SizeChart = {
  unit: 'cm',
  columns: ['Chest (round)', 'Length', 'Shoulder'],
  rows: [
    { size: '2–3Y', values: ['56', '38', '25'] },
    { size: '3–4Y', values: ['58', '41', '26'] },
    { size: '4–5Y', values: ['61', '44', '27'] },
    { size: '5–6Y', values: ['64', '47', '28'] },
    { size: '6–7Y', values: ['67', '50', '29'] },
    { size: '7–8Y', values: ['70', '53', '31'] },
    { size: '9–10Y', values: ['76', '58', '33'] },
    { size: '11–12Y', values: ['82', '62', '35'] },
    { size: '13–14Y', values: ['88', '66', '37'] },
    { size: '15–16Y', values: ['92', '69', '39'] },
  ],
  note: 'Age sizing is indicative. Use the chest measurement when ordering uniforms for a class or team.',
};

const ALL_METHODS: CustomizationMethodId[] = [
  'screen-printing',
  'dtg',
  'dtf',
  'sublimation',
  'heat-transfer',
  'embroidery',
  'puff-printing',
  'vinyl-printing',
];

const ALL_LOCATIONS: CustomizationLocationId[] = [
  'left-chest',
  'right-chest',
  'centre-front',
  'full-front',
  'upper-back',
  'full-back',
  'left-sleeve',
  'right-sleeve',
];

/** Per-unit surcharge by method — feeds the live price calculation. */
const METHOD_PRICING: Record<CustomizationMethodId, { setupFee: number; pricePerUnit: number }> = {
  'screen-printing': { setupFee: 450, pricePerUnit: 18 },
  dtg: { setupFee: 0, pricePerUnit: 65 },
  dtf: { setupFee: 0, pricePerUnit: 55 },
  sublimation: { setupFee: 300, pricePerUnit: 70 },
  'heat-transfer': { setupFee: 0, pricePerUnit: 40 },
  embroidery: { setupFee: 600, pricePerUnit: 85 },
  'puff-printing': { setupFee: 500, pricePerUnit: 75 },
  'vinyl-printing': { setupFee: 0, pricePerUnit: 45 },
};

/** Print-area limits by location, used by the artwork guidance and future canvas. */
const LOCATION_AREA: Record<CustomizationLocationId, { w: number; h: number; price: number }> = {
  'left-chest': { w: 100, h: 100, price: 0 },
  'right-chest': { w: 100, h: 100, price: 0 },
  'centre-front': { w: 200, h: 200, price: 15 },
  'full-front': { w: 300, h: 400, price: 35 },
  'upper-back': { w: 280, h: 120, price: 20 },
  'full-back': { w: 300, h: 420, price: 35 },
  'left-sleeve': { w: 80, h: 200, price: 12 },
  'right-sleeve': { w: 80, h: 200, price: 12 },
};

function buildImages(seed: ProductSeed): ProductImage[] {
  const images: ProductImage[] = seed.gallery.map((item, index) => ({
    id: `${seed.id}-img-${index + 1}`,
    url: item.url,
    alt: `${seed.name} — ${item.caption}`,
    role: item.role,
  }));

  /*
   * A colour's shot is often one the gallery already carries — the lifestyle
   * photo is frequently the navy variant, for instance. Tag the existing entry
   * with the colour instead of appending the same file twice, or the gallery
   * shows the identical picture in two slots.
   */
  Object.entries(seed.colorImages ?? {}).forEach(([colorId, url]) => {
    const existing = images.find((image) => image.url === url && !image.colorId);
    if (existing) {
      existing.colorId = colorId;
      return;
    }
    images.push({
      id: `${seed.id}-color-${colorId}`,
      url,
      alt: `${seed.name} in ${colorId.replace(/-/g, ' ')}`,
      role: 'front',
      colorId,
    });
  });

  return images;
}

function buildAccordions(seed: ProductSeed) {
  const methodLabels = seed.methods.map((id) => CUSTOMIZATION_METHOD_LABELS[id]);
  const locationLabels = seed.locations.map((id) => CUSTOMIZATION_LOCATION_LABELS[id]);

  return [
    {
      id: 'product-details',
      title: 'Product Details',
      paragraphs: [seed.description],
      bullets: seed.highlights,
    },
    {
      id: 'fabric-construction',
      title: 'Fabric & Construction',
      specs: [
        { label: 'Fabric', value: FABRIC_LABELS[seed.fabric] },
        { label: 'Composition', value: seed.fabricComposition },
        { label: 'Weight', value: `${seed.gsm} GSM` },
        { label: 'Fit', value: seed.fit },
        { label: 'Finish', value: 'Bio-washed, pre-shrunk, colour-fast dyed' },
      ],
    },
    {
      id: 'size-dimensions',
      title: 'Size & Dimensions',
      paragraphs: [
        `Available in ${seed.sizes.length} sizes${
          seed.sizeGroup === 'kids' ? ' from 2–3Y to 15–16Y' : ' from XS to 5XL'
        }. Measurements are listed in the size guide.`,
      ],
      bullets: seed.locations.map(
        (location) =>
          `${CUSTOMIZATION_LOCATION_LABELS[location]} print area: ${LOCATION_AREA[location].w} × ${LOCATION_AREA[location].h} mm`
      ),
    },
    {
      id: 'printing-embroidery',
      title: 'Printing & Embroidery',
      paragraphs: [
        `Supported methods on this garment: ${methodLabels.join(', ')}.`,
        `Branding can be applied at ${locationLabels.join(', ')}.`,
      ],
      bullets: [
        'Digital proof shared for approval before production starts.',
        'Pantone matching available on screen printing and embroidery.',
        'Wash-tested for 30+ cycles at 40°C.',
      ],
    },
    {
      id: 'shipping-delivery',
      title: 'Shipping & Delivery',
      paragraphs: [
        'Production begins once artwork is approved. Delivery estimates on this page are calculated from your postcode and the chosen delivery speed.',
      ],
      bullets: [
        'Standard and express dispatch options at checkout.',
        'Split delivery available on orders above 500 units.',
        'Tracking shared by email and SMS.',
      ],
    },
    {
      id: 'care-instructions',
      title: 'Care Instructions',
      bullets: seed.careInstructions,
    },
    {
      id: 'returns-policy',
      title: 'Returns / Custom Product Policy',
      paragraphs: [
        'Blank garments can be returned unworn within 7 days of delivery.',
        'Customised production is made to order and cannot be resold, so it is only replaceable for manufacturing defects, print defects or a mismatch with the approved digital proof. Report issues within 7 days of delivery with photographs.',
      ],
    },
  ];
}

function createProduct(seed: ProductSeed): CustomWearProduct {
  const tierSeeds = seed.tiers ?? standardTiers(seed.basePrice);
  const priceTiers: PriceTier[] = tierSeeds.map(([minQty, maxQty, pricePerUnit]) => ({
    minQty,
    maxQty,
    pricePerUnit,
  }));

  const prices = priceTiers.map((tier) => tier.pricePerUnit);

  return {
    id: seed.id,
    slug: seed.slug,
    sku: seed.sku,
    name: seed.name,
    shortDescription: seed.shortDescription,
    description: seed.description,
    gender: seed.gender,
    category: seed.category,
    productType: seed.productType,
    fabric: seed.fabric,
    gsm: seed.gsm,
    fit: seed.fit,
    basePrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    currency: 'INR',
    priceTiers,
    colors: seed.colors.map((colorId) =>
      productColor(colorId, {
        skuSuffix: colorId.slice(0, 3).toUpperCase(),
        imageId: seed.colorImages?.[colorId] ? `${seed.id}-color-${colorId}` : undefined,
      })
    ),
    sizes: productSizes(seed.sizes, seed.sizeGroup),
    customizationMethods: ALL_METHODS.map((id) => ({
      id,
      supported: seed.methods.includes(id),
      setupFee: METHOD_PRICING[id].setupFee,
      pricePerUnit: METHOD_PRICING[id].pricePerUnit,
      note: seed.methods.includes(id) ? undefined : 'Not available on this fabric',
    })),
    customizationLocations: ALL_LOCATIONS.map((id) => ({
      id,
      supported: seed.locations.includes(id),
      maxWidthMm: LOCATION_AREA[id].w,
      maxHeightMm: LOCATION_AREA[id].h,
      pricePerUnit: LOCATION_AREA[id].price,
    })),
    images: buildImages(seed),
    rating: seed.rating,
    reviewCount: seed.reviewCount,
    badges: seed.badges,
    minOrderQuantity: seed.minOrderQuantity,
    defaultQuantity: seed.defaultQuantity,
    highlights: seed.highlights,
    accordions: buildAccordions(seed),
    descriptionBlock: seed.descriptionBlock,
    sizeChart: seed.sizeGroup === 'kids' ? KIDS_SIZE_CHART : ADULT_SIZE_CHART,
    relatedProductIds: seed.relatedProductIds,
    popularity: seed.popularity,
    createdAt: seed.createdAt,
  };
}

// ============================================
// SEEDS
// ============================================

/**
 * A product's gallery, from however many genuine photographs it has.
 *
 * It used to turn two images into six slides: the front shot repeated and
 * captioned "back view" and "side profile", a stock fabric swatch captioned
 * "fabric close-up", and a marketing banner captioned "branding locations".
 * Each made a claim the image did not support. Only real shots ship, and a
 * product with none falls through to the colour view rather than borrowing a
 * banner. Add back and detail photography here as it is produced.
 */
const galleryFor = (...urls: Array<string | undefined>): GallerySeed[] => {
  const seen = new Set<string>();
  const unique: string[] = [];

  urls.forEach((url) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    unique.push(url);
  });

  return unique.map((url, index) => ({
    url,
    role: index === 0 ? ('front' as const) : ('lifestyle' as const),
    caption: index === 0 ? 'front view' : 'worn on model',
  }));
};

const PRODUCT_SEEDS: ProductSeed[] = [
  {
    id: 'cw-men-polo-classic',
    slug: 'custom-mens-classic-polo-t-shirt',
    sku: 'CI-MP-220-CLS',
    name: "Custom Men's Classic Polo T-Shirt",
    shortDescription:
      'Create professional custom polos with printing or embroidery across multiple branding locations.',
    description:
      'A 220 GSM cotton-rich pique polo built for daily corporate wear. The collar is knitted rather than cut, so it holds its shape through repeated industrial washing — the single biggest complaint with cheaper uniform polos.',
    gender: 'men',
    category: 'mens-polo',
    productType: 'polo',
    fabric: 'cotton-blend',
    fabricComposition: '60% combed cotton / 40% polyester pique',
    gsm: 220,
    fit: 'Regular fit',
    basePrice: 570,
    tiers: [
      [1, 9, 570],
      [10, 24, 540],
      [25, 49, 495],
      [50, 99, 450],
      [100, null, 399],
    ],
    colors: ['black', 'white', 'navy', 'royal-blue', 'red', 'maroon', 'grey', 'bottle-green', 'yellow', 'orange'],
    colorImages: { white: IMG.mensShirt },
    sizes: ADULT_SIZES,
    sizeGroup: 'adult',
    methods: ['screen-printing', 'dtf', 'heat-transfer', 'embroidery', 'vinyl-printing'],
    locations: ['left-chest', 'right-chest', 'centre-front', 'upper-back', 'full-back', 'left-sleeve', 'right-sleeve'],
    gallery: galleryFor(IMG.mensPolo),
    rating: 4.6,
    reviewCount: 134,
    badges: ['bestseller', 'no-moq'],
    minOrderQuantity: 1,
    defaultQuantity: 25,
    popularity: 98,
    createdAt: '2026-01-18',
    highlights: [
      'Premium 220 GSM pique fabric',
      'Cotton-polyester blend that resists pilling',
      'Regular fit with knitted rib collar and cuffs',
      'Ten stock colours, no minimum order',
      'Long-lasting print and embroidery finish',
      'Front, back and sleeve customization',
      'Bulk pricing from 10 units',
    ],
    careInstructions: [
      'Machine wash cold with like colours',
      'Do not bleach; wash printed side inward',
      'Tumble dry low or line dry in shade',
      'Warm iron on the reverse, never directly on print',
    ],
    descriptionBlock: {
      heading: 'Custom Printed Polo T-Shirts for Business, Teams & Events',
      intro:
        'The classic polo is the workhorse of corporate apparel: smart enough for a client-facing team, durable enough for daily wear, and a forgiving canvas for embroidery and print alike.',
      benefits: [
        'Premium 220 GSM fabric that holds colour after 30+ washes',
        'Professional appearance with a structured, non-curling collar',
        'Long-lasting customization backed by a digital proof approval step',
        'Up to seven branding locations on a single garment',
        'Bulk-friendly pricing that steps down from 10 units',
      ],
      useCases: [
        'Business branding and reception teams',
        'Team uniforms across multiple sites',
        'Event and exhibition staff kits',
        'Corporate gifting and onboarding packs',
      ],
    },
    relatedProductIds: ['cw-men-polo-premium', 'cw-men-roundneck-essential', 'cw-men-sports-jersey', 'cw-women-polo-classic'],
  },
  {
    id: 'cw-men-polo-premium',
    slug: 'premium-embroidered-mens-polo',
    sku: 'CI-MP-240-EMB',
    name: "Premium Embroidered Men's Polo",
    shortDescription:
      'Heavyweight combed cotton polo finished with dense embroidery for executive and hospitality teams.',
    description:
      'A 240 GSM 100% combed cotton polo with a mercerised finish and reinforced placket. Specified for embroidery first: the fabric is stable enough to carry dense logo stitching without puckering.',
    gender: 'men',
    category: 'mens-polo',
    productType: 'polo',
    fabric: 'cotton-100',
    fabricComposition: '100% combed ring-spun cotton pique',
    gsm: 240,
    fit: 'Tailored fit',
    basePrice: 749,
    colors: ['black', 'white', 'navy', 'bottle-green', 'maroon', 'grey', 'beige'],
    colorImages: { white: IMG.mensShirt },
    sizes: ADULT_SIZES,
    sizeGroup: 'adult',
    methods: ['embroidery', 'screen-printing', 'vinyl-printing', 'heat-transfer'],
    locations: ['left-chest', 'right-chest', 'upper-back', 'left-sleeve', 'right-sleeve'],
    gallery: galleryFor(IMG.mensShirt),
    rating: 4.8,
    reviewCount: 86,
    badges: ['premium'],
    minOrderQuantity: 10,
    defaultQuantity: 25,
    popularity: 84,
    createdAt: '2026-02-06',
    highlights: [
      'Heavyweight 240 GSM combed cotton',
      'Mercerised finish with a subtle sheen',
      'Reinforced three-button placket',
      'Tailored cut through the body and sleeve',
      'Optimised for dense logo embroidery',
      'Side vents with taped seams',
    ],
    careInstructions: [
      'Machine wash cold, gentle cycle',
      'Do not bleach or dry clean',
      'Reshape while damp and line dry',
      'Steam rather than press embroidered areas',
    ],
    descriptionBlock: {
      heading: 'Embroidered Polos for Executive and Hospitality Teams',
      intro:
        'When a logo has to look considered rather than printed on, embroidery on a heavier cotton is the answer. This polo is specified around that finish.',
      benefits: [
        'Dense 240 GSM base that carries stitch weight without puckering',
        'Mercerised cotton for a premium hand-feel',
        'Colour-matched thread selection from a 400-shade library',
        'Consistent repeat orders held against a saved digitised file',
      ],
      useCases: ['Hotel and hospitality uniforms', 'Executive and leadership kit', 'Golf days and corporate hospitality'],
    },
    relatedProductIds: ['cw-men-polo-classic', 'cw-men-sweatshirt-crew', 'cw-women-polo-classic', 'cw-men-hoodie-heavy'],
  },
  {
    id: 'cw-men-roundneck-essential',
    slug: 'custom-mens-round-neck-t-shirt',
    sku: 'CI-MR-180-ESS',
    name: "Custom Men's Round Neck T-Shirt",
    shortDescription:
      'Everyday 180 GSM cotton tee — the most cost-effective canvas for full-front and full-back printing.',
    description:
      'A bio-washed 180 GSM single jersey tee with shoulder-to-shoulder taping and a ribbed neckline. The default choice for high-volume event and campaign printing.',
    gender: 'unisex',
    category: 'mens-round-neck',
    productType: 'round-neck',
    fabric: 'cotton-100',
    fabricComposition: '100% bio-washed cotton single jersey',
    gsm: 180,
    fit: 'Regular fit',
    basePrice: 349,
    colors: ['black', 'white', 'navy', 'royal-blue', 'sky-blue', 'red', 'maroon', 'green', 'grey', 'yellow', 'orange', 'purple'],
    colorImages: { red: IMG.roundNeck },
    sizes: ADULT_SIZES,
    sizeGroup: 'adult',
    methods: ['screen-printing', 'dtg', 'dtf', 'heat-transfer', 'puff-printing', 'vinyl-printing'],
    locations: ALL_LOCATIONS,
    gallery: galleryFor(IMG.roundNeck),
    rating: 4.5,
    reviewCount: 262,
    badges: ['bestseller', 'no-moq'],
    minOrderQuantity: 1,
    defaultQuantity: 50,
    popularity: 100,
    createdAt: '2025-11-22',
    highlights: [
      'Bio-washed 180 GSM cotton jersey',
      'Shoulder-to-shoulder taping keeps the neckline square',
      'Twelve stock colours',
      'All eight branding locations supported',
      'Best price per unit for full-front artwork',
      'No minimum order quantity',
    ],
    careInstructions: [
      'Machine wash cold, inside out',
      'Do not bleach',
      'Tumble dry low',
      'Cool iron, avoid the print area',
    ],
    descriptionBlock: {
      heading: 'Custom Round Neck T-Shirts for Campaigns, Events and Merch',
      intro:
        'A round neck tee is the cheapest way to put a large graphic in front of people. This one is bio-washed so it feels soft on day one rather than after five washes.',
      benefits: [
        'Lowest unit cost across the Custom Wear range',
        'Takes screen, DTG, DTF and puff printing equally well',
        'Twelve colours in stock for fast turnaround',
        'Unisex sizing simplifies bulk allocation',
      ],
      useCases: ['College and campus events', 'Marathon and fundraising runs', 'Retail merchandise drops', 'Factory and warehouse teams'],
    },
    relatedProductIds: ['cw-men-roundneck-organic', 'cw-men-polo-classic', 'cw-men-sports-jersey', 'cw-women-roundneck-relaxed'],
  },
  {
    id: 'cw-men-roundneck-organic',
    slug: 'organic-cotton-round-neck-t-shirt',
    sku: 'CI-MR-200-ORG',
    name: "Organic Cotton Round Neck T-Shirt",
    shortDescription:
      'GOTS-certified organic cotton tee for brands that need traceable, low-impact apparel.',
    description:
      'A 200 GSM GOTS-certified organic cotton tee, undyed-cotton natural option included. Supplied with batch traceability documentation for ESG reporting.',
    gender: 'unisex',
    category: 'mens-round-neck',
    productType: 'round-neck',
    fabric: 'organic-cotton',
    fabricComposition: '100% GOTS-certified organic cotton',
    gsm: 200,
    fit: 'Relaxed fit',
    basePrice: 499,
    colors: ['white', 'black', 'navy', 'beige', 'bottle-green', 'grey'],
    sizes: ADULT_SIZES,
    sizeGroup: 'adult',
    methods: ['screen-printing', 'dtg', 'embroidery'],
    locations: ['left-chest', 'centre-front', 'full-front', 'upper-back', 'full-back'],
    gallery: galleryFor(IMG.roundNeck),
    rating: 4.7,
    reviewCount: 58,
    badges: ['eco-friendly', 'premium'],
    minOrderQuantity: 25,
    defaultQuantity: 50,
    popularity: 71,
    createdAt: '2026-03-02',
    highlights: [
      'GOTS-certified organic cotton',
      '200 GSM with a heavier, structured drape',
      'Water-based inks only, no plastisol',
      'Batch traceability documents on request',
      'Recyclable mono-material packaging',
    ],
    careInstructions: [
      'Wash at 30°C with a mild detergent',
      'Do not bleach or use optical brighteners',
      'Line dry in shade to protect the fibre',
      'Iron on reverse at low heat',
    ],
    descriptionBlock: {
      heading: 'Organic Custom T-Shirts for Sustainability-Led Brands',
      intro:
        'Sustainability claims need paperwork behind them. This tee ships with certification and batch traceability so procurement can evidence it.',
      benefits: [
        'GOTS certification covering fibre through to finished garment',
        'Water-based printing inks as standard',
        'Lower-impact dyeing with reduced water consumption',
        'Documentation pack for ESG and tender submissions',
      ],
      useCases: ['Sustainability-led corporate gifting', 'Conference and summit merchandise', 'Retail brands with published ESG targets'],
    },
    relatedProductIds: ['cw-men-roundneck-essential', 'cw-men-sweatshirt-crew', 'cw-women-roundneck-relaxed', 'cw-men-polo-premium'],
  },
  {
    id: 'cw-men-hoodie-heavy',
    slug: 'custom-mens-heavyweight-hoodie',
    sku: 'CI-MH-320-HVY',
    name: "Custom Men's Heavyweight Hoodie",
    shortDescription:
      'A 320 GSM brushed fleece hoodie built for embroidery, puff print and winter campaign wear.',
    description:
      'A 320 GSM brushed-back fleece hoodie with a double-layer hood, metal-tipped drawcords and kangaroo pocket. Heavy enough for outdoor winter uniforms without a jacket.',
    gender: 'men',
    category: 'mens-hoodies',
    productType: 'hoodie',
    fabric: 'cotton-blend',
    fabricComposition: '80% cotton / 20% polyester brushed fleece',
    gsm: 320,
    fit: 'Regular fit',
    basePrice: 1249,
    colors: ['black', 'navy', 'grey', 'maroon', 'bottle-green', 'beige'],
    sizes: ADULT_SIZES,
    sizeGroup: 'adult',
    methods: ['embroidery', 'screen-printing', 'dtf', 'puff-printing', 'vinyl-printing'],
    locations: ['left-chest', 'centre-front', 'full-front', 'upper-back', 'full-back', 'left-sleeve', 'right-sleeve'],
    gallery: galleryFor(),
    rating: 4.7,
    reviewCount: 97,
    badges: ['premium', 'new-options'],
    minOrderQuantity: 10,
    defaultQuantity: 25,
    popularity: 88,
    createdAt: '2026-02-20',
    highlights: [
      'Heavyweight 320 GSM brushed fleece',
      'Double-layer hood holds shape when down',
      'Metal-tipped drawcords and reinforced eyelets',
      'Kangaroo pocket with bar-tacked corners',
      'Ribbed cuffs and hem with elastane',
      'Excellent base for puff print and 3D embroidery',
    ],
    careInstructions: [
      'Machine wash cold, inside out',
      'Do not tumble dry on high heat',
      'Do not iron directly over print or embroidery',
      'Wash separately for the first two cycles',
    ],
    descriptionBlock: {
      heading: 'Custom Hoodies for Winter Uniforms, Campus and Streetwear Drops',
      intro:
        'A hoodie carries branding at a size nothing else does — full-back artwork on 320 GSM fleece reads clearly from across a site or a stadium.',
      benefits: [
        'Weight that works as outerwear in most Indian winters',
        'Large, flat back panel for full-size artwork',
        'Puff and 3D embroidery both supported',
        'Colour-fast dyes that survive repeated industrial washing',
      ],
      useCases: ['Campus and society merchandise', 'Winter site uniforms', 'Streetwear and limited drops', 'Team travel kit'],
    },
    relatedProductIds: ['cw-men-sweatshirt-crew', 'cw-women-hoodie-relaxed', 'cw-men-polo-premium', 'cw-kids-hoodie-fleece'],
  },
  {
    id: 'cw-men-sweatshirt-crew',
    slug: 'custom-mens-crew-neck-sweatshirt',
    sku: 'CI-MS-280-CRW',
    name: "Custom Men's Crew Neck Sweatshirt",
    shortDescription:
      'Mid-weight 280 GSM crew sweatshirt with a clean chest panel for large logo placement.',
    description:
      'A 280 GSM loop-back cotton sweatshirt with set-in sleeves and a ribbed neck gusset. The uninterrupted chest panel makes it the easiest garment in the range for large centred logos.',
    gender: 'men',
    category: 'mens-sweatshirts',
    productType: 'sweatshirt',
    fabric: 'cotton-blend',
    fabricComposition: '70% cotton / 30% polyester loop-back knit',
    gsm: 280,
    fit: 'Regular fit',
    basePrice: 949,
    colors: ['black', 'navy', 'grey', 'bottle-green', 'maroon', 'beige', 'white'],
    sizes: ADULT_SIZES,
    sizeGroup: 'adult',
    methods: ['screen-printing', 'embroidery', 'dtf', 'puff-printing'],
    locations: ['left-chest', 'centre-front', 'full-front', 'upper-back', 'full-back'],
    gallery: galleryFor(),
    rating: 4.5,
    reviewCount: 74,
    minOrderQuantity: 10,
    defaultQuantity: 25,
    popularity: 76,
    createdAt: '2026-01-30',
    highlights: [
      'Mid-weight 280 GSM loop-back knit',
      'Ribbed neck gusset prevents stretching',
      'Set-in sleeves for a clean chest panel',
      'Twin-needle stitched hem and cuffs',
      'Layers under a jacket without bulk',
    ],
    careInstructions: [
      'Machine wash cold with like colours',
      'Do not bleach',
      'Dry flat to hold the shape',
      'Warm iron on reverse only',
    ],
    descriptionBlock: {
      heading: 'Custom Sweatshirts for Teams, Campuses and Corporate Winter Kit',
      intro:
        'The crew sweatshirt sits between a tee and a hoodie: warm enough for an office in winter, smart enough to wear in front of clients.',
      benefits: [
        'Flat, uninterrupted chest panel for centred artwork',
        'Mid-weight knit that layers cleanly',
        'Takes both embroidery and large-format screen print',
        'Consistent sizing across repeat orders',
      ],
      useCases: ['Corporate winter kit', 'Campus societies and clubs', 'Retail and hospitality back-of-house teams'],
    },
    relatedProductIds: ['cw-men-hoodie-heavy', 'cw-women-sweatshirt-crop', 'cw-men-polo-classic', 'cw-men-roundneck-organic'],
  },
  {
    id: 'cw-men-sports-jersey',
    slug: 'custom-mens-dry-fit-sports-jersey',
    sku: 'CI-MSP-160-DRY',
    name: "Custom Men's Dry Fit Sports Jersey",
    shortDescription:
      'Lightweight 160 GSM dry-fit jersey engineered for sublimation and full-team number sets.',
    description:
      'A 160 GSM micro-mesh polyester jersey with moisture-wicking finish and raglan sleeves. Sublimation-ready, so all-over designs, gradients and player numbers print edge to edge without cracking.',
    gender: 'men',
    category: 'mens-sports-wear',
    productType: 'sportswear',
    fabric: 'dry-fit',
    fabricComposition: '100% micro-mesh performance polyester',
    gsm: 160,
    fit: 'Athletic fit',
    basePrice: 649,
    colors: ['black', 'white', 'royal-blue', 'red', 'green', 'yellow', 'orange', 'navy', 'sky-blue'],
    colorImages: { red: IMG.roundNeck },
    sizes: ADULT_SIZES,
    sizeGroup: 'adult',
    methods: ['sublimation', 'heat-transfer', 'vinyl-printing', 'dtf'],
    locations: ['centre-front', 'full-front', 'upper-back', 'full-back', 'left-sleeve', 'right-sleeve'],
    gallery: galleryFor(IMG.roundNeck),
    rating: 4.6,
    reviewCount: 143,
    badges: ['bestseller'],
    minOrderQuantity: 10,
    defaultQuantity: 20,
    popularity: 92,
    createdAt: '2026-03-14',
    highlights: [
      'Moisture-wicking 160 GSM micro-mesh',
      'Raglan sleeves for unrestricted movement',
      'Sublimation-ready for all-over artwork',
      'Player names and numbers included in setup',
      'Four-way stretch side panels',
      'Quick-dry finish for back-to-back fixtures',
    ],
    careInstructions: [
      'Machine wash cold, do not use fabric softener',
      'Do not iron the printed area',
      'Line dry — heat damages the wicking finish',
      'Do not dry clean',
    ],
    descriptionBlock: {
      heading: 'Custom Sportswear for Clubs, Corporate Leagues and Tournaments',
      intro:
        'Sublimation puts the design into the fibre rather than on top of it, so numbers and sponsor logos do not crack after a season of washing.',
      benefits: [
        'Full-colour, edge-to-edge artwork with no weight penalty',
        'Individual names and numbers at no extra setup per shirt',
        'Wicking finish that survives repeated match-day washing',
        'Matching shorts and training tops available on request',
      ],
      useCases: ['Cricket and football clubs', 'Corporate sports leagues', 'School athletics meets', 'Marathon and cycling teams'],
    },
    relatedProductIds: ['cw-men-roundneck-essential', 'cw-women-sports-tee', 'cw-kids-sports-jersey', 'cw-men-polo-classic'],
  },
  {
    id: 'cw-women-polo-classic',
    slug: 'custom-womens-classic-polo-t-shirt',
    sku: 'CI-WP-200-CLS',
    name: "Custom Women's Classic Polo T-Shirt",
    shortDescription:
      'Cut for a woman’s fit with a softer 200 GSM pique — the counterpart to the men’s corporate polo.',
    description:
      'A 200 GSM cotton-blend pique polo with a shaped side seam, shorter placket and set-in sleeve. Colour-matched to the men’s classic polo so mixed teams stay visually consistent.',
    gender: 'women',
    category: 'womens-polo',
    productType: 'polo',
    fabric: 'cotton-blend',
    fabricComposition: '60% combed cotton / 40% polyester pique',
    gsm: 200,
    fit: 'Contoured fit',
    basePrice: 549,
    colors: ['black', 'white', 'navy', 'sky-blue', 'red', 'maroon', 'pink', 'grey', 'bottle-green'],
    colorImages: { pink: IMG.womensPolo },
    sizes: ADULT_SIZES,
    sizeGroup: 'adult',
    methods: ['screen-printing', 'dtf', 'heat-transfer', 'embroidery', 'vinyl-printing'],
    locations: ['left-chest', 'right-chest', 'upper-back', 'full-back', 'left-sleeve', 'right-sleeve'],
    gallery: galleryFor(IMG.womensPolo),
    rating: 4.6,
    reviewCount: 118,
    badges: ['bestseller', 'no-moq'],
    minOrderQuantity: 1,
    defaultQuantity: 25,
    popularity: 90,
    createdAt: '2026-01-18',
    highlights: [
      'Softer 200 GSM pique with a finer knit',
      'Shaped side seams for a contoured fit',
      'Three-button placket cut shorter',
      'Colour-matched to the men’s classic polo',
      'No minimum order quantity',
    ],
    careInstructions: [
      'Machine wash cold with like colours',
      'Do not bleach',
      'Tumble dry low or line dry in shade',
      'Warm iron on reverse',
    ],
    descriptionBlock: {
      heading: 'Women’s Custom Polos for Corporate and Hospitality Teams',
      intro:
        'A uniform only works when everyone on the team has something that fits. This polo is colour-matched to the men’s version so a mixed team still reads as one.',
      benefits: [
        'Contoured cut with a shorter, flatter placket',
        'Identical dye lots to the men’s classic polo',
        'Same branding locations and price steps across both fits',
        'Sizes XS–5XL held in stock',
      ],
      useCases: ['Front-of-house and reception teams', 'Retail floor uniforms', 'Trade shows and exhibitions'],
    },
    relatedProductIds: ['cw-men-polo-classic', 'cw-women-roundneck-relaxed', 'cw-women-hoodie-relaxed', 'cw-women-sports-tee'],
  },
  {
    id: 'cw-women-roundneck-relaxed',
    slug: 'custom-womens-relaxed-round-neck-t-shirt',
    sku: 'CI-WR-180-RLX',
    name: "Custom Women's Relaxed Round Neck T-Shirt",
    shortDescription:
      'Soft 180 GSM combed cotton tee with a relaxed drop-shoulder cut and full-front print area.',
    description:
      'A 180 GSM combed cotton tee with a slightly dropped shoulder and a longer body. Popular for retail merchandise where the garment has to be wearable outside of work.',
    gender: 'women',
    category: 'womens-round-neck',
    productType: 'round-neck',
    fabric: 'cotton-100',
    fabricComposition: '100% combed cotton single jersey',
    gsm: 180,
    fit: 'Relaxed fit',
    basePrice: 379,
    colors: ['white', 'black', 'beige', 'pink', 'sky-blue', 'navy', 'grey', 'purple', 'yellow'],
    colorImages: { purple: IMG.womensTop },
    sizes: ADULT_SIZES,
    sizeGroup: 'adult',
    methods: ['dtg', 'dtf', 'screen-printing', 'heat-transfer', 'puff-printing'],
    locations: ['left-chest', 'centre-front', 'full-front', 'upper-back', 'full-back'],
    gallery: galleryFor(IMG.womensTop),
    rating: 4.4,
    reviewCount: 91,
    badges: ['no-moq'],
    minOrderQuantity: 1,
    defaultQuantity: 30,
    popularity: 79,
    createdAt: '2026-02-11',
    highlights: [
      'Soft 180 GSM combed cotton',
      'Relaxed body with a slight drop shoulder',
      'Longer hemline for layering',
      'DTG printing supported for one-off pieces',
      'No minimum order quantity',
    ],
    careInstructions: [
      'Machine wash cold, inside out',
      'Do not bleach',
      'Tumble dry low',
      'Cool iron on reverse',
    ],
    descriptionBlock: {
      heading: 'Women’s Custom T-Shirts for Merchandise and Events',
      intro:
        'A relaxed cut people actually wear again — which is the whole point of merchandise that carries your name.',
      benefits: [
        'Retail-quality handfeel in a customizable blank',
        'Full-colour DTG for small runs and samples',
        'Nine colours including seasonal pastels',
        'Single-piece ordering for sampling before a bulk run',
      ],
      useCases: ['Retail merchandise', 'Conference giveaways', 'Studio and wellness brands', 'Campus societies'],
    },
    relatedProductIds: ['cw-women-polo-classic', 'cw-men-roundneck-essential', 'cw-women-sweatshirt-crop', 'cw-women-sports-tee'],
  },
  {
    id: 'cw-women-hoodie-relaxed',
    slug: 'custom-womens-relaxed-hoodie',
    sku: 'CI-WH-300-RLX',
    name: "Custom Women's Relaxed Hoodie",
    shortDescription:
      'A 300 GSM brushed fleece hoodie with a relaxed body and cropped sleeve finish.',
    description:
      'A 300 GSM brushed-back fleece hoodie cut with a relaxed body, slightly shortened length and narrower cuff. Designed to sit well over a tee without adding bulk at the hip.',
    gender: 'women',
    category: 'womens-hoodies',
    productType: 'hoodie',
    fabric: 'cotton-blend',
    fabricComposition: '80% cotton / 20% polyester brushed fleece',
    gsm: 300,
    fit: 'Relaxed fit',
    basePrice: 1199,
    colors: ['black', 'grey', 'beige', 'pink', 'navy', 'bottle-green', 'purple'],
    sizes: ADULT_SIZES,
    sizeGroup: 'adult',
    methods: ['embroidery', 'screen-printing', 'dtf', 'puff-printing'],
    locations: ['left-chest', 'centre-front', 'full-front', 'upper-back', 'full-back', 'left-sleeve'],
    gallery: galleryFor(),
    rating: 4.7,
    reviewCount: 64,
    badges: ['new'],
    minOrderQuantity: 10,
    defaultQuantity: 20,
    popularity: 73,
    createdAt: '2026-04-04',
    highlights: [
      'Brushed 300 GSM fleece with a soft inner face',
      'Relaxed body, shortened length',
      'Narrow ribbed cuff and hem',
      'Twin-needle topstitched hood seam',
      'Embroidery and puff print supported',
    ],
    careInstructions: [
      'Machine wash cold, inside out',
      'Do not tumble dry on high',
      'Do not iron over print or embroidery',
      'Wash separately for the first two cycles',
    ],
    descriptionBlock: {
      heading: 'Women’s Custom Hoodies for Campus, Studio and Retail',
      intro:
        'Same fleece as the men’s heavyweight, cut differently — so a team order does not force everyone into one silhouette.',
      benefits: [
        'Relaxed cut that layers over a tee cleanly',
        'Full-back panel for large artwork',
        'Colour range shared with the women’s tee for coordinated sets',
        'Embroidery-ready chest panel',
      ],
      useCases: ['Campus societies', 'Fitness and yoga studios', 'Retail drops', 'Winter team kit'],
    },
    relatedProductIds: ['cw-men-hoodie-heavy', 'cw-women-sweatshirt-crop', 'cw-women-roundneck-relaxed', 'cw-women-polo-classic'],
  },
  {
    id: 'cw-women-sweatshirt-crop',
    slug: 'custom-womens-crew-sweatshirt',
    sku: 'CI-WS-260-CRW',
    name: "Custom Women's Crew Sweatshirt",
    shortDescription:
      'Lighter 260 GSM crew sweatshirt with a boxy body and clean front panel for centred artwork.',
    description:
      'A 260 GSM loop-back sweatshirt with a boxy body, dropped shoulder and ribbed neck. Lighter than the men’s crew so it works through spring and autumn as well as winter.',
    gender: 'women',
    category: 'womens-sweatshirts',
    productType: 'sweatshirt',
    fabric: 'cotton-blend',
    fabricComposition: '70% cotton / 30% polyester loop-back knit',
    gsm: 260,
    fit: 'Boxy fit',
    basePrice: 899,
    colors: ['black', 'grey', 'beige', 'pink', 'navy', 'white', 'purple'],
    sizes: ADULT_SIZES,
    sizeGroup: 'adult',
    methods: ['screen-printing', 'embroidery', 'dtf', 'puff-printing'],
    locations: ['left-chest', 'centre-front', 'full-front', 'upper-back', 'full-back'],
    gallery: galleryFor(IMG.womensTop),
    rating: 4.5,
    reviewCount: 47,
    badges: ['new-options'],
    minOrderQuantity: 10,
    defaultQuantity: 20,
    popularity: 66,
    createdAt: '2026-03-26',
    highlights: [
      'Lighter 260 GSM loop-back knit',
      'Boxy body with a dropped shoulder',
      'Ribbed neck, cuffs and hem',
      'Large uninterrupted front panel',
      'Seven colours including seasonal shades',
    ],
    careInstructions: [
      'Machine wash cold with like colours',
      'Do not bleach',
      'Dry flat to preserve shape',
      'Warm iron on reverse only',
    ],
    descriptionBlock: {
      heading: 'Women’s Custom Sweatshirts for Studios, Campuses and Brands',
      intro:
        'A lighter crew that works past winter — the most-repeated complaint about branded sweatshirts is that they only get worn for three months of the year.',
      benefits: [
        'Wearable across three seasons at 260 GSM',
        'Boxy silhouette that suits centred logo placement',
        'Colour range coordinated with the women’s hoodie',
        'Embroidery and puff print both supported',
      ],
      useCases: ['Studio and wellness brands', 'Campus merchandise', 'Retail collections', 'Corporate gifting'],
    },
    relatedProductIds: ['cw-women-hoodie-relaxed', 'cw-men-sweatshirt-crew', 'cw-women-roundneck-relaxed', 'cw-women-polo-classic'],
  },
  {
    id: 'cw-women-sports-tee',
    slug: 'custom-womens-performance-sports-tee',
    sku: 'CI-WSP-150-PRF',
    name: "Custom Women's Performance Sports Tee",
    shortDescription:
      'Featherweight 150 GSM recycled performance polyester with four-way stretch and wicking finish.',
    description:
      'A 150 GSM recycled performance polyester tee with four-way stretch, flat-lock seams and a wicking finish. Made from post-consumer recycled yarn without giving up performance.',
    gender: 'women',
    category: 'womens-sports-wear',
    productType: 'sportswear',
    fabric: 'recycled-polyester',
    fabricComposition: '92% recycled polyester / 8% elastane',
    gsm: 150,
    fit: 'Athletic fit',
    basePrice: 699,
    colors: ['black', 'white', 'pink', 'sky-blue', 'purple', 'grey', 'royal-blue'],
    sizes: ADULT_SIZES,
    sizeGroup: 'adult',
    methods: ['sublimation', 'heat-transfer', 'vinyl-printing', 'dtf'],
    locations: ['left-chest', 'centre-front', 'full-front', 'upper-back', 'full-back'],
    gallery: galleryFor(IMG.womensTop),
    rating: 4.6,
    reviewCount: 52,
    badges: ['eco-friendly', 'new'],
    minOrderQuantity: 25,
    defaultQuantity: 30,
    popularity: 68,
    createdAt: '2026-04-18',
    highlights: [
      'Featherweight 150 GSM recycled polyester',
      'Four-way stretch with elastane',
      'Flat-lock seams reduce chafing',
      'Wicking finish for high-output activity',
      'Approximately nine recycled bottles per garment',
    ],
    careInstructions: [
      'Machine wash cold, no fabric softener',
      'Do not iron the printed area',
      'Line dry — heat damages the elastane',
      'Do not dry clean',
    ],
    descriptionBlock: {
      heading: 'Women’s Custom Sportswear for Clubs, Studios and Events',
      intro:
        'Recycled polyester used to mean a compromise on stretch and handfeel. This fabric is engineered so it does not.',
      benefits: [
        'Post-consumer recycled yarn with full traceability',
        'Sublimation for all-over club and sponsor artwork',
        'Four-way stretch that holds shape through a season',
        'Coordinates with the men’s dry-fit jersey for mixed squads',
      ],
      useCases: ['Running and cycling clubs', 'Fitness studios', 'Corporate wellness events', 'School athletics'],
    },
    relatedProductIds: ['cw-men-sports-jersey', 'cw-women-roundneck-relaxed', 'cw-kids-sports-jersey', 'cw-women-polo-classic'],
  },
  {
    id: 'cw-kids-polo-school',
    slug: 'custom-kids-polo-t-shirt',
    sku: 'CI-KP-200-SCH',
    name: "Custom Kid's Polo T-Shirt",
    shortDescription:
      'Durable 200 GSM school polo with reinforced seams and age sizing from 2–3Y to 15–16Y.',
    description:
      'A 200 GSM pique polo built for school wear: reinforced shoulder seams, colour-fast dyes tested for daily washing, and a soft-touch collar that will not irritate.',
    gender: 'kids',
    category: 'kids-polo',
    productType: 'polo',
    fabric: 'cotton-blend',
    fabricComposition: '65% cotton / 35% polyester pique',
    gsm: 200,
    fit: 'Regular fit',
    basePrice: 429,
    colors: ['white', 'navy', 'sky-blue', 'red', 'bottle-green', 'yellow', 'black', 'maroon'],
    colorImages: { 'sky-blue': IMG.boysPolo },
    sizes: KIDS_SIZES,
    sizeGroup: 'kids',
    methods: ['embroidery', 'screen-printing', 'heat-transfer', 'vinyl-printing'],
    locations: ['left-chest', 'right-chest', 'upper-back', 'left-sleeve'],
    gallery: galleryFor(IMG.boysPolo),
    rating: 4.5,
    reviewCount: 76,
    badges: ['bestseller'],
    minOrderQuantity: 25,
    defaultQuantity: 50,
    popularity: 81,
    createdAt: '2026-01-09',
    highlights: [
      'Hard-wearing 200 GSM cotton-rich pique',
      'Reinforced shoulder and side seams',
      'Colour-fast dyes tested to 50 wash cycles',
      'Soft-touch collar with no scratchy label',
      'Ten age sizes from 2–3Y to 15–16Y',
    ],
    careInstructions: [
      'Machine wash at 40°C with like colours',
      'Do not bleach',
      'Tumble dry low',
      'Warm iron, avoid the crest',
    ],
    descriptionBlock: {
      heading: 'Custom School and Club Polos for Children',
      intro:
        'School kit is washed twice a week for a year. This polo is specified around that, not around a showroom sample.',
      benefits: [
        'Reinforced construction at the seams that fail first',
        'Embroidered crests held on file for repeat term orders',
        'Full age-size run held in stock',
        'Colour-fast to repeated hot washing',
      ],
      useCases: ['School uniforms', 'Sports academies and clubs', 'Summer camps', 'Nursery and daycare'],
    },
    relatedProductIds: ['cw-kids-roundneck-play', 'cw-kids-sports-jersey', 'cw-kids-hoodie-fleece', 'cw-men-polo-classic'],
  },
  {
    id: 'cw-kids-roundneck-play',
    slug: 'custom-kids-round-neck-t-shirt',
    sku: 'CI-KR-180-PLY',
    name: "Custom Kid's Round Neck T-Shirt",
    shortDescription:
      'Soft 180 GSM cotton tee for camps, events and school activity days.',
    description:
      'A 180 GSM bio-washed cotton tee with a ribbed neckline and taped shoulders, sized 2–3Y to 15–16Y. The lowest-cost way to kit out a full year group.',
    gender: 'kids',
    category: 'kids-round-neck',
    productType: 'round-neck',
    fabric: 'cotton-100',
    fabricComposition: '100% bio-washed cotton single jersey',
    gsm: 180,
    fit: 'Regular fit',
    basePrice: 289,
    colors: ['white', 'yellow', 'sky-blue', 'red', 'green', 'orange', 'pink', 'navy', 'black'],
    colorImages: { 'sky-blue': IMG.boysPolo },
    sizes: KIDS_SIZES,
    sizeGroup: 'kids',
    methods: ['screen-printing', 'dtg', 'dtf', 'heat-transfer'],
    locations: ['left-chest', 'centre-front', 'full-front', 'upper-back', 'full-back'],
    gallery: galleryFor(IMG.boysPolo),
    rating: 4.4,
    reviewCount: 103,
    badges: ['no-moq'],
    minOrderQuantity: 1,
    defaultQuantity: 50,
    popularity: 77,
    createdAt: '2025-12-12',
    highlights: [
      'Soft bio-washed 180 GSM cotton',
      'Taped shoulder seams',
      'Nine bright colours for group identification',
      'Full-front print area for large artwork',
      'No minimum order quantity',
    ],
    careInstructions: [
      'Machine wash cold, inside out',
      'Do not bleach',
      'Tumble dry low',
      'Cool iron, avoid the print',
    ],
    descriptionBlock: {
      heading: 'Custom Kids T-Shirts for Camps, Events and School Days',
      intro:
        'Bright colours make groups easy to count on a trip. That is usually the real requirement behind a school t-shirt order.',
      benefits: [
        'Nine high-visibility colours for group separation',
        'Lowest unit cost in the kids range',
        'Large front panel for sponsor or event artwork',
        'Single-piece ordering for samples',
      ],
      useCases: ['School trips and activity days', 'Summer camps', 'Sports days', 'Community and charity events'],
    },
    relatedProductIds: ['cw-kids-polo-school', 'cw-kids-sports-jersey', 'cw-kids-sweatshirt-school', 'cw-men-roundneck-essential'],
  },
  {
    id: 'cw-kids-hoodie-fleece',
    slug: 'custom-kids-fleece-hoodie',
    sku: 'CI-KH-280-FLC',
    name: "Custom Kid's Fleece Hoodie",
    shortDescription:
      'Warm 280 GSM fleece hoodie with a cord-free hood that meets children’s safety guidance.',
    description:
      'A 280 GSM brushed fleece hoodie built to children’s safety guidance: no drawcords at the neck, no small detachable parts, and flat-seam construction at the shoulder.',
    gender: 'kids',
    category: 'kids-hoodies',
    productType: 'hoodie',
    fabric: 'cotton-blend',
    fabricComposition: '80% cotton / 20% polyester brushed fleece',
    gsm: 280,
    fit: 'Regular fit',
    basePrice: 899,
    colors: ['navy', 'grey', 'black', 'red', 'bottle-green', 'pink', 'sky-blue'],
    sizes: KIDS_SIZES,
    sizeGroup: 'kids',
    methods: ['embroidery', 'screen-printing', 'dtf', 'heat-transfer'],
    locations: ['left-chest', 'centre-front', 'full-front', 'upper-back', 'full-back'],
    gallery: galleryFor(IMG.boysPolo),
    rating: 4.6,
    reviewCount: 41,
    badges: ['new'],
    minOrderQuantity: 25,
    defaultQuantity: 30,
    popularity: 62,
    createdAt: '2026-04-25',
    highlights: [
      'Warm 280 GSM brushed fleece',
      'Cord-free hood per children’s safety guidance',
      'Flat-seam shoulders to avoid rubbing',
      'Kangaroo pocket with bar-tacked corners',
      'Ten age sizes',
    ],
    careInstructions: [
      'Machine wash at 40°C, inside out',
      'Do not tumble dry on high',
      'Do not iron over the print',
      'Wash separately for the first two cycles',
    ],
    descriptionBlock: {
      heading: 'Custom Kids Hoodies for Schools, Clubs and Leavers Kit',
      intro:
        'The hoodie most often ordered for leavers years and club kit — specified to the safety guidance schools ask about first.',
      benefits: [
        'Cord-free hood construction',
        'Full-back panel for a leavers name list',
        'Embroidered crest option held for repeat orders',
        'Sizing that runs to 15–16Y for older year groups',
      ],
      useCases: ['Leavers hoodies', 'Sports academies', 'School clubs and societies', 'Winter trip kit'],
    },
    relatedProductIds: ['cw-kids-sweatshirt-school', 'cw-kids-polo-school', 'cw-men-hoodie-heavy', 'cw-kids-roundneck-play'],
  },
  {
    id: 'cw-kids-sweatshirt-school',
    slug: 'custom-kids-crew-sweatshirt',
    sku: 'CI-KS-260-CRW',
    name: "Custom Kid's Crew Sweatshirt",
    shortDescription:
      'Classic 260 GSM school sweatshirt with a reinforced neck gusset and embroidered crest option.',
    description:
      'A 260 GSM loop-back sweatshirt with a ribbed neck gusset that survives being pulled over the head twice a day. The standard school crew, made to hold its shape for a full academic year.',
    gender: 'kids',
    category: 'kids-sweatshirts',
    productType: 'sweatshirt',
    fabric: 'cotton-blend',
    fabricComposition: '70% cotton / 30% polyester loop-back knit',
    gsm: 260,
    fit: 'Regular fit',
    basePrice: 749,
    colors: ['navy', 'bottle-green', 'maroon', 'grey', 'black', 'sky-blue', 'red'],
    sizes: KIDS_SIZES,
    sizeGroup: 'kids',
    methods: ['embroidery', 'screen-printing', 'heat-transfer', 'vinyl-printing'],
    locations: ['left-chest', 'centre-front', 'upper-back'],
    gallery: galleryFor(IMG.boysPolo),
    rating: 4.5,
    reviewCount: 68,
    minOrderQuantity: 25,
    defaultQuantity: 50,
    popularity: 64,
    createdAt: '2026-02-28',
    highlights: [
      'Standard 260 GSM school-weight knit',
      'Ribbed neck gusset resists stretching',
      'Twin-needle stitched cuffs and hem',
      'Embroidered crest held on file between terms',
      'Ten age sizes in seven uniform colours',
    ],
    careInstructions: [
      'Machine wash at 40°C with like colours',
      'Do not bleach',
      'Dry flat to preserve shape',
      'Warm iron on reverse, avoid the crest',
    ],
    descriptionBlock: {
      heading: 'Custom School Sweatshirts with Embroidered Crests',
      intro:
        'The neckline is the first thing to fail on a school sweatshirt. A ribbed gusset is the difference between one term and one year.',
      benefits: [
        'Construction targeted at the neckline failure point',
        'Digitised crest stored for identical repeat orders',
        'Uniform colour palette matched across the kids range',
        'Term-time reorder lead times from 7 working days',
      ],
      useCases: ['School uniforms', 'Nursery and prep schools', 'Clubs and after-school programmes'],
    },
    relatedProductIds: ['cw-kids-hoodie-fleece', 'cw-kids-polo-school', 'cw-men-sweatshirt-crew', 'cw-kids-roundneck-play'],
  },
  {
    id: 'cw-kids-sports-jersey',
    slug: 'custom-kids-sports-jersey',
    sku: 'CI-KSP-150-DRY',
    name: "Custom Kid's Sports Jersey",
    shortDescription:
      'Lightweight 150 GSM dry-fit jersey for school teams, sports days and junior clubs.',
    description:
      'A 150 GSM micro-mesh polyester jersey with a wicking finish, sized for children. Sublimation-ready for full team kits with names and numbers.',
    gender: 'kids',
    category: 'kids-sports-wear',
    productType: 'sportswear',
    fabric: 'performance-polyester',
    fabricComposition: '100% micro-mesh performance polyester',
    gsm: 150,
    fit: 'Athletic fit',
    basePrice: 479,
    colors: ['red', 'royal-blue', 'yellow', 'green', 'white', 'black', 'orange', 'sky-blue'],
    colorImages: { 'sky-blue': IMG.boysPolo },
    sizes: KIDS_SIZES,
    sizeGroup: 'kids',
    methods: ['sublimation', 'heat-transfer', 'vinyl-printing'],
    locations: ['centre-front', 'full-front', 'upper-back', 'full-back'],
    gallery: galleryFor(IMG.boysPolo),
    rating: 4.5,
    reviewCount: 55,
    minOrderQuantity: 10,
    defaultQuantity: 25,
    popularity: 70,
    createdAt: '2026-03-20',
    highlights: [
      'Lightweight 150 GSM micro-mesh',
      'Quick-dry wicking finish',
      'Sublimation-ready for full team artwork',
      'Names and numbers included in setup',
      'House colours available for sports days',
    ],
    careInstructions: [
      'Machine wash cold, no fabric softener',
      'Do not iron the printed area',
      'Line dry away from direct heat',
      'Do not dry clean',
    ],
    descriptionBlock: {
      heading: 'Custom Kids Sportswear for Schools and Junior Clubs',
      intro:
        'House colours, numbers and names — all sublimated into the fabric, so nothing peels off in the wash before the season ends.',
      benefits: [
        'Sublimated artwork that cannot crack or peel',
        'Per-shirt names and numbers with no extra setup',
        'Bright house colours held in stock',
        'Lightweight enough for summer sports days',
      ],
      useCases: ['School sports days', 'Junior football and cricket clubs', 'Athletics meets', 'Summer camps'],
    },
    relatedProductIds: ['cw-kids-roundneck-play', 'cw-men-sports-jersey', 'cw-kids-polo-school', 'cw-women-sports-tee'],
  },
];

// ============================================
// EXPORT
// ============================================

export const CUSTOM_WEAR_PRODUCTS: CustomWearProduct[] = PRODUCT_SEEDS.map(createProduct);

export const CUSTOM_WEAR_PRICE_BOUNDS = {
  min: Math.min(...CUSTOM_WEAR_PRODUCTS.map((product) => product.basePrice)),
  max: Math.max(...CUSTOM_WEAR_PRODUCTS.map((product) => product.maxPrice ?? product.basePrice)),
};
