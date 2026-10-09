import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { authMiddleware, optionalAuth, roleMiddleware, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { isNonEmptyString, parsePagination, pickProductFields } from '@/utils/helpers';
import { colorCards, colorDetails, effectiveStock } from '@/utils/product-colors';
import { COLOUR_FAMILIES, canonicalFamily, suggestFamily } from '@/utils/colour-families';
import { assertCanModifyProduct, describeDuplicate, resolveOwnerForCreate, uniqueProductSlug } from '@/utils/vendor';
import { recomputeProductRating } from '@/utils/ratings';
import {
  SIZE_ORDER,
  filterableAttributes,
  isLiveCheckError,
  prepareListingWrite,
  templateInfo,
} from '@/utils/product-spec';
import { categoryColumns, categoryExtras } from '@/utils/category-fields';
import {
  ensureDefaultCustomizations,
  guardCustomizable,
  parseCustomizationRows,
  replaceCustomizations,
} from '@/utils/customizations';
import {
  CATEGORY_SELECT,
  buildCategoryTree,
  categoryScope,
  resolveTemplate,
  type CategoryNode,
} from '@/utils/category-tree';
import { HttpError, isHttpError } from '@/utils/helpers';
import { revalidateCatalog } from '@/utils/revalidate';

const router = Router();

const canManageProducts = roleMiddleware(['ADMIN', 'VENDOR']);

/**
 * Order statuses that mean a sale actually happened.
 *
 * The `popular` sort ranks on units sold, so a status list that quietly omits
 * half the fulfilment pipeline under-counts every product that is currently in
 * transit. Listed once here rather than inlined at the sort.
 */
const SOLD_ORDER_STATUSES = [
  'CONFIRMED',
  'PROCESSING',
  'READY_FOR_SHIPMENT',
  'SHIPPED',
  'DELIVERED',
] as const;

/** `?sale=1`, `?sale=true` and `?sale=on` all mean the same thing. */
const isTruthyFlag = (value: unknown): boolean =>
  value === '1' || value === 'true' || value === 'on' || value === true;

/** Comma-separated keyword list, e.g. `?match=polo,tee`. */
const keywordList = (value: unknown): string[] =>
  typeof value === 'string'
    ? value.split(',').map((term) => term.trim().toLowerCase()).filter(Boolean).slice(0, 12)
    : [];

/** Attribute keys the storefront may filter on (see product-spec filterable). */
const FILTERABLE_KEYS = new Set(filterableAttributes().map((a) => a.key));

/**
 * `attr_<key>=<value>` pairs from a query string, limited to filterable keys:
 * a template's, or `categoryKeys`, the filterable fields of the category asked for.
 */
const attributeFiltersFrom = (
  query: Record<string, unknown>,
  categoryKeys: Set<string> = new Set()
): Array<[string, string]> =>
  Object.entries(query)
    .filter(([name, value]) => name.startsWith('attr_') && isNonEmptyString(value))
    .map(([name, value]) => [name.slice(5), String(value).trim().slice(0, 80)] as [string, string])
    .filter(([key]) => FILTERABLE_KEYS.has(key) || categoryKeys.has(key))
    .slice(0, 8);

/**
 * A listing only reaches the storefront if its shop is live.
 *
 * House stock (`vendorId: null`) is always visible — it is the platform's own.
 * A seller's listing needs the shop to be both active and verified, which is
 * what makes approval mean something: a shop can prepare its whole catalogue
 * and none of it sells until an admin says so.
 *
 * Declared once because every public read path owes the shopper the same
 * answer. The typeahead below used to omit it entirely, so a suspended shop's
 * stock could still be suggested while the listing and the product page both
 * refused to show it.
 */
const STOREFRONT_VISIBILITY: Prisma.ProductWhereInput = {
  // A seller's listing is also checked by the platform before it can sell.
  // House stock defaults to APPROVED, so this costs it nothing.
  moderationStatus: 'APPROVED',
  OR: [{ vendorId: null }, { vendor: { is: { isActive: true, isVerified: true } } }],
};

/**
 * Edits that change what a shopper is shown send an approved listing back to
 * the queue. Price and stock are left out on purpose: sellers change those
 * daily, and re-reviewing every restock would bury the queue.
 */
const FIELDS_NEEDING_REVIEW = [
  'name',
  'description',
  'shortDescription',
  'images',
  'thumbnail',
  'videoUrl',
  'categoryId',
  'brandId',
  'material',
  'attributes',
  'imageAngles',
  'displayName',
  'styleNote',
] as const;

/**
 * Words carried by nearly every garment description, so requiring them turns a
 * useful query into an empty one. Dropped only when something else survives —
 * a shopper who types "the" on its own still gets the literal search.
 */
const SEARCH_STOPWORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'the', 'to', 'with']);

/** Longest query we will tokenise. Past this it is not a search, it is a paste. */
const MAX_SEARCH_TOKENS = 6;

/**
 * Split a query into the words that have to be matched.
 *
 * Searching the raw string is why "black polo" returned nothing: no product is
 * literally named that, so `ILIKE '%black polo%'` failed even though a black
 * polo is in the catalogue. Matching word by word is what makes a two-word
 * query behave the way a shopper expects.
 */
/**
 * "girls dress" found nothing for a "Baby Girl … Dress": matching is by
 * substring, so the singular finds both forms while the plural finds only
 * itself. Deliberately crude; shopper queries are short garment words.
 */
const singular = (word: string): string => {
  if (word.length > 4 && /(ss|sh|ch|x)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') && !/\d/.test(word)) return word.slice(0, -1);
  return word;
};

const searchTokens = (term: string): string[] => {
  const words = term
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((word) => word.length > 0);

  const meaningful = words.filter((word) => !SEARCH_STOPWORDS.has(word));
  return (meaningful.length > 0 ? meaningful : words).slice(0, MAX_SEARCH_TOKENS).map(singular);
};

/**
 * Every token must appear somewhere on the product, though not in the same
 * field — "black polo" is satisfied by a polo whose colour is black.
 *
 * The fields listed here are the ones a shopper describes a garment with.
 * Ranking, not the filter, is what keeps a description-only hit below a name
 * match; widening the net here and ordering properly afterwards beats a narrow
 * filter that answers "no results" to a query the catalogue can serve.
 */
const productSearchFilter = (tokens: string[]): Prisma.ProductWhereInput => ({
  AND: tokens.map((token) => ({
    OR: [
      { name: { contains: token, mode: 'insensitive' } },
      { sku: { contains: token, mode: 'insensitive' } },
      { shortDescription: { contains: token, mode: 'insensitive' } },
      { description: { contains: token, mode: 'insensitive' } },
      { color: { contains: token, mode: 'insensitive' } },
      { material: { contains: token, mode: 'insensitive' } },
      { category: { is: { name: { contains: token, mode: 'insensitive' } } } },
      { brand: { is: { name: { contains: token, mode: 'insensitive' } } } },
      // Listing data a seller fills in: "kids girls jumper" or a size SKU.
      { displayName: { contains: token, mode: 'insensitive' } },
      { articleType: { contains: token, mode: 'insensitive' } },
      { ageGroup: { contains: token, mode: 'insensitive' } },
      { primaryColour: { contains: token, mode: 'insensitive' } },
      { variants: { some: { sku: { contains: token, mode: 'insensitive' } } } },
    ],
  })),
});

/**
 * Fields a shopper must never receive. Cost price is the seller's margin (the
 * listing form promises it is never shown), and a moderation note is between
 * the seller and our team.
 */
const PRIVATE_PRODUCT_FIELDS = ['costPrice', 'moderationNote', 'moderatedAt'] as const;

const withoutPrivateFields = <T extends Record<string, unknown>>(product: T): Omit<T, (typeof PRIVATE_PRODUCT_FIELDS)[number]> => {
  const copy: Record<string, unknown> = { ...product };
  for (const field of PRIVATE_PRODUCT_FIELDS) delete copy[field];
  return copy as Omit<T, (typeof PRIVATE_PRODUCT_FIELDS)[number]>;
};

/** The fields relevance is computed from, and nothing else. */
const RELEVANCE_SELECT = {
  id: true,
  name: true,
  sku: true,
  shortDescription: true,
  description: true,
  color: true,
  material: true,
  rating: true,
  isFeatured: true,
  category: { select: { name: true } },
  brand: { select: { name: true } },
} satisfies Prisma.ProductSelect;

type RankableProduct = {
  id: string;
  name: string;
  sku: string;
  shortDescription?: string | null;
  description?: string | null;
  color?: string | null;
  material?: string | null;
  rating?: number | null;
  isFeatured?: boolean | null;
  category?: { name: string } | null;
  brand?: { name: string } | null;
};

/**
 * Weights, in the order a shopper would defend them.
 *
 * An exact SKU is someone reading off a purchase order and it should win
 * outright; an exact name is next; a name that starts with the query beats one
 * that merely contains it; a description hit is a weak signal because every
 * description in this catalogue mentions cotton, custom and embroidery.
 */
const SCORE = {
  skuExact: 1000,
  nameExact: 600,
  skuToken: 120,
  namePrefix: 90,
  nameWordPrefix: 70,
  nameToken: 45,
  categoryToken: 30,
  brandToken: 28,
  attributeToken: 22,
  shortDescriptionToken: 14,
  descriptionToken: 8,
  phraseInName: 140,
  featured: 6,
} as const;

const includesToken = (haystack: string | null | undefined, needle: string): boolean =>
  typeof haystack === 'string' && haystack.toLowerCase().includes(needle);

/** Escape a token so it can sit inside a RegExp built from shopper input. */
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when the token starts a word, so "shirt" hits "Formal Shirt" ahead of "Sweatshirt". */
const startsWord = (haystack: string, needle: string): boolean =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}`, 'u').test(haystack);

/** How well one product answers the query. Higher is better. */
const relevanceScore = (product: RankableProduct, tokens: string[], phrase: string): number => {
  const name = product.name.toLowerCase();
  const sku = product.sku.toLowerCase();

  let score = 0;

  if (sku === phrase) score += SCORE.skuExact;
  if (name === phrase) score += SCORE.nameExact;
  if (phrase.length > 0 && name.includes(phrase)) score += SCORE.phraseInName;
  if (product.isFeatured) score += SCORE.featured;

  for (const token of tokens) {
    if (sku.includes(token)) score += SCORE.skuToken;

    if (name.startsWith(token)) score += SCORE.namePrefix;
    else if (startsWord(name, token)) score += SCORE.nameWordPrefix;
    else if (name.includes(token)) score += SCORE.nameToken;

    if (includesToken(product.category?.name, token)) score += SCORE.categoryToken;
    if (includesToken(product.brand?.name, token)) score += SCORE.brandToken;
    if (includesToken(product.color, token) || includesToken(product.material, token)) {
      score += SCORE.attributeToken;
    }
    if (includesToken(product.shortDescription, token)) score += SCORE.shortDescriptionToken;
    if (includesToken(product.description, token)) score += SCORE.descriptionToken;
  }

  return score;
};

/**
 * Rank a candidate set. Rating breaks a score tie and the name breaks a rating
 * tie, so the order is stable across requests — without a total order, page two
 * of a search would reshuffle between fetches.
 */
const rankByRelevance = <T extends RankableProduct>(
  products: T[],
  tokens: string[],
  phrase: string
): T[] =>
  products
    .map((product) => ({ product, score: relevanceScore(product, tokens, phrase) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.product.rating ?? 0) - (a.product.rating ?? 0) ||
        a.product.name.localeCompare(b.product.name)
    )
    .map((entry) => entry.product);

/**
 * Padded trigrams, formed the way Postgres's `pg_trgm` forms them, so a
 * similarity computed here ranks the same way an indexed one would if this ever
 * moves into the database.
 */
const trigrams = (value: string): Set<string> => {
  const normalised = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const padded = `  ${normalised} `;
  const set = new Set<string>();
  for (let index = 0; index + 3 <= padded.length; index += 1) {
    set.add(padded.slice(index, index + 3));
  }
  return set;
};

/** Jaccard overlap of two trigram sets: 1 is identical, 0 shares nothing. */
const trigramSimilarity = (a: string, b: string): number => {
  const left = trigrams(a);
  const right = trigrams(b);
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / (left.size + right.size - shared);
};

/**
 * Best similarity between the query and anything on the product worth
 * comparing it to. A typo is usually in the noun the shopper reached for, so
 * each word of the name is scored on its own as well as the whole of it —
 * "frok" is a poor match for "Kids Party Frock" and an excellent one for
 * "Frock".
 */
const fuzzyScore = (product: RankableProduct, phrase: string): number => {
  const candidates = [product.name, product.sku, product.category?.name ?? '', ...product.name.split(/\s+/)];
  return candidates.reduce((best, candidate) => Math.max(best, trigramSimilarity(phrase, candidate)), 0);
};

/** Below this, two strings are different words rather than a typo of each other. */
const FUZZY_THRESHOLD = 0.34;

/** Widest set a fuzzy pass will read. It only runs when the strict search found nothing. */
const FUZZY_SCAN_CAP = 400;

/** Largest match set we will rank in full. Past it, relevance ordering is skipped. */
const RELEVANCE_SCAN_CAP = 500;

/** Resolve a product by id or slug. */
const findProductByIdOrSlug = (idOrSlug: string) =>
  prisma.product.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
  });


// @route   GET /api/products
// @desc    Get all products with filters
// @access  Public
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { search, category, minPrice, maxPrice, featured, onSale, sortBy, ids } = req.query;
    // Aliases matching 9impression's listing API, so the same query string
    // works against either backend: `q` for the search term, `sale` and
    // `newest` for the two badge filters, `color` for the swatch facet.
    const term = isNonEmptyString(req.query.q) ? req.query.q : search;
    const wantsSale = isTruthyFlag(onSale) || isTruthyFlag(req.query.sale);
    const wantsNewest = isTruthyFlag(req.query.newest);
    // Colour filters on the fixed colour family, never the seller's free-text
    // name: "navy", "Navy Blue " and "Nevy blue" are all Navy Blue. Several
    // families may be given, comma-separated; an old URL with a colour name
    // still works because the name is read as its family.
    const colourFamilies = isNonEmptyString(req.query.color)
      ? [
          ...new Set(
            req.query.color
              .split(',')
              .map((value) => (canonicalFamily(value) ?? suggestFamily(value))?.name)
              .filter((name): name is string => Boolean(name))
          ),
        ]
      : [];
    const color = isNonEmptyString(req.query.color) ? req.query.color.trim() : null;
    // Brand accepts a slug or an id, the way `category` already does, so a
    // readable /products?brand=nike works as well as a stored id.
    const brand = isNonEmptyString(req.query.brand) ? req.query.brand.trim() : null;
    // Seller facet: accepts the shop slug or its id.
    const vendor = isNonEmptyString(req.query.vendor) ? req.query.vendor.trim() : null;
    // Subcategory narrowing. It used to run in the browser over one fetched
    // page, so the result count and "load more" both described the unnarrowed
    // catalogue. Applied here, the count is the truth.
    // Size facet: a variant's size as sold, or its Myntra standard size.
    const size = isNonEmptyString(req.query.size) ? req.query.size.trim() : null;
    // "Ideal for": Myntra's age group, e.g. Kids-Girls. A bare "girls" works too.
    const ageGroup = isNonEmptyString(req.query.ageGroup) ? req.query.ageGroup.trim() : null;
    // A section's audience (girls' tops). Unlike `ageGroup`, products listed
    // before age groups existed still qualify, through the section's keywords.
    const audience = isNonEmptyString(req.query.audience) ? req.query.audience.trim() : null;
    const matchTerms = keywordList(req.query.match);
    const excludeTerms = keywordList(req.query.exclude);
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 12, 50);

    /**
     * `?ids=a,b,c` fetches an explicit set, in the order asked for.
     *
     * This is what curated homepage sections read: the admin stores the ids it
     * chose, and the order of that list is the order on the page. Prisma
     * cannot order by an arbitrary list, so the sort happens below, after the
     * rows come back.
     */
    const requestedIds =
      typeof ids === 'string' && ids.trim() !== ''
        ? [...new Set(ids.split(',').map((id) => id.trim()).filter(Boolean))].slice(0, 50)
        : null;

    // 1. Build query based on filters
    const where: Prisma.ProductWhereInput = { status: 'ACTIVE' };

    if (requestedIds) {
      where.id = { in: requestedIds };
    }

    // AND-ed explicitly rather than reusing `where.OR`, because the colour and
    // keyword filters below each need an OR group of their own and a single
    // top-level `OR` would let them satisfy one another.
    const and: Prisma.ProductWhereInput[] = [];

    /**
     * The search term, tokenised. Every word has to land somewhere on the
     * product, but not all in the same field: "black polo" is answered by a
     * polo whose colour is black, which the old whole-string `contains` over
     * name/description/sku could never do.
     */
    const phrase = typeof term === 'string' ? term.trim().toLowerCase() : '';
    const tokens = phrase.length > 0 ? searchTokens(phrase) : [];
    if (tokens.length > 0) {
      and.push(productSearchFilter(tokens));
    }

    // A product matches a colour when any of its variants is that colour, or
    // when its own colour field is. Same rule as 9impression, which checks its
    // product_colors table and falls back to the product's brand colour.
    if (color) {
      and.push(
        colourFamilies.length
          ? {
              OR: [
                { colorFamily: { in: colourFamilies } },
                { variants: { some: { colorFamily: { in: colourFamilies } } } },
              ],
            }
          : // Nothing recognisable asked for: match nothing rather than everything.
            { id: { in: [] } }
      );
    }

    if (brand) {
      where.brand = { is: { OR: [{ slug: brand }, { id: brand }] } };
    }

    // Only active shops. A listing whose seller has been suspended stays out of
    // the catalogue even though the product row is still ACTIVE.
    if (vendor) {
      where.vendor = {
        is: { isActive: true, isVerified: true, OR: [{ shopSlug: vendor }, { id: vendor }] },
      };
    }

    if (size) {
      and.push({
        variants: {
          some: {
            OR: [
              { size: { equals: size, mode: 'insensitive' } },
              { standardSize: { equals: size, mode: 'insensitive' } },
            ],
          },
        },
      });
    }

    if (ageGroup) {
      and.push({ ageGroup: { contains: ageGroup, mode: 'insensitive' } });
    }

    if (audience) {
      and.push({ OR: [{ ageGroup: { contains: audience, mode: 'insensitive' } }, { ageGroup: null }] });
    }

    // Shop must be live. Declared once at the top of the file so the typeahead
    // cannot drift from the listing.
    and.push(STOREFRONT_VISIBILITY);

    // Any match term may hit; no exclude term may.
    if (matchTerms.length > 0) {
      and.push({ OR: matchTerms.map((word) => ({ name: { contains: word, mode: 'insensitive' } })) });
    }
    for (const word of excludeTerms) {
      and.push({ NOT: { name: { contains: word, mode: 'insensitive' } } });
    }

    // Added in the last 30 days, matching their `newest=1`.
    if (wantsNewest) {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      and.push({ createdAt: { gte: cutoff } });
    }

    // A category covers everything nested under it: /c/footwear lists the
    // sneakers filed under Footwear › Sneakers. An unknown slug matches nothing.
    let categoryFilterable = new Map<string, string>();
    if (typeof category === 'string' && category.trim().length > 0) {
      const rows = await prisma.category.findMany({ select: CATEGORY_SELECT });
      const scope = categoryScope(rows, category.trim());
      where.categoryId = { in: scope };
      // The fields the admin marked filterable on this category (or above it).
      categoryFilterable = new Map(
        (await categoryColumns(scope[0])).filter((c) => c.filterable).map((c) => [c.key, c.kind])
      );
    }

    // Template attribute facets: `attr_upperMaterial=Leather`. Only keys some
    // template marks filterable, or the category's own filterable fields, are
    // honoured, so a query string cannot probe arbitrary JSON paths.
    for (const [key, value] of attributeFiltersFrom(
      req.query as Record<string, unknown>,
      new Set(categoryFilterable.keys())
    )) {
      // A multi-select field stores a list: "has HDMI" rather than "is HDMI".
      and.push({
        attributes:
          categoryFilterable.get(key) === 'multiselect'
            ? { path: [key], array_contains: [value] }
            : { path: [key], equals: value },
      });
    }

    if (and.length > 0) where.AND = and;

    const priceFilter: Prisma.FloatFilter<'Product'> = {};
    const min = Number(minPrice);
    const max = Number(maxPrice);
    if (minPrice !== undefined && Number.isFinite(min)) priceFilter.gte = min;
    if (maxPrice !== undefined && Number.isFinite(max)) priceFilter.lte = max;
    if (priceFilter.gte !== undefined || priceFilter.lte !== undefined) {
      where.price = priceFilter;
    }

    if (featured === 'true') {
      where.isFeatured = true;
    }

    // Stock used to be filtered in the browser after fetching, so the result
    // count described products the shopper could not actually buy.
    // A product sold in sizes is in stock when any size is; its own quantity
    // column is not kept in step with the variants (see effectiveStock).
    if (isTruthyFlag(req.query.inStock)) {
      const inStock: Prisma.ProductWhereInput = {
        OR: [
          { variants: { none: {} }, quantity: { gt: 0 } },
          { variants: { some: { quantity: { gt: 0 } } } },
        ],
      };
      where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), inStock];
    }

    // Sale = discounted, i.e. a strictly higher original price is recorded.
    if (wantsSale) {
      where.discountPercentage = { gt: 0 };
    }

    /**
     * Sort keys accept both spellings: this project's originals and
     * 9impression's (`popular`, `new`, `price-low`, `price-high`), so a URL
     * copied between the two stores sorts the same way.
     *
     * `popular` is the one that cannot be expressed as an `orderBy`: it ranks
     * on units actually sold, which needs a group-by over order items. It is
     * resolved separately below.
     */
    const wantsPopular = sortBy === 'popular';
    let orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: 'desc' };
    switch (sortBy) {
      case 'price_asc':
      case 'price-low':
        orderBy = { price: 'asc' };
        break;
      case 'price_desc':
      case 'price-high':
        orderBy = { price: 'desc' };
        break;
      case 'rating':
        orderBy = { rating: 'desc' };
        break;
      case 'newest':
      case 'new':
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    /**
     * Popularity order: product ids ranked by units sold on orders that were
     * actually paid for or fulfilled. Products with no sales are absent from
     * this list and fall to the end, newest first, so a fresh catalogue still
     * renders in a sensible order rather than empty.
     */
    let popularIds: string[] = [];
    if (wantsPopular) {
      const sold = await prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: { status: { in: [...SOLD_ORDER_STATUSES] } } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 500,
      });
      popularIds = sold.map((row) => row.productId);
    }

    /**
     * Relevance is the default order for a search, and only for a search.
     *
     * Browsing a category still lands on newest-first; there is nothing to be
     * relevant to. An explicit sort always wins, so choosing price-low on a
     * search result page does what it says.
     *
     * The whole match set is ranked before a page is cut out of it, the same
     * way `popular` has to be, because relevance is not expressible as an
     * `orderBy` — the score depends on where in each row the words landed.
     * Only the scalar fields the score reads are pulled for that pass; the
     * page itself is then fetched by id with its full includes, so ranking
     * costs one narrow query rather than hydrating the whole match set.
     *
     * Past RELEVANCE_SCAN_CAP rows we decline rather than half-rank: an
     * arbitrary 500 of the matches ordered well is worse than all of them
     * ordered predictably.
     */
    const wantsRelevance =
      tokens.length > 0 && !requestedIds && !wantsPopular && (!sortBy || sortBy === 'relevance');

    let relevanceIds: string[] = [];
    let relevanceTotal: number | null = null;
    if (wantsRelevance) {
      const candidates = await prisma.product.findMany({
        where,
        select: RELEVANCE_SELECT,
        take: RELEVANCE_SCAN_CAP + 1,
      });
      if (candidates.length <= RELEVANCE_SCAN_CAP) {
        relevanceIds = rankByRelevance(candidates, tokens, phrase).map((product) => product.id);
        // The scan saw every match, so it already knows the total and the
        // count query below can be skipped.
        relevanceTotal = relevanceIds.length;
      }
    }

    /** The ids this page shows, in the order it shows them. */
    const relevancePageIds =
      relevanceIds.length > 0 ? relevanceIds.slice(skip, skip + limit) : null;

    // 2. Paginate results
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: relevancePageIds ? { ...where, id: { in: relevancePageIds } } : where,
        orderBy,
        // An explicit id list is already bounded and its order is meaningful,
        // so paginating it would silently truncate a curated section. The
        // popular sort likewise has to rank the whole match set before it can
        // slice a page out of it. A relevance page is already the slice.
        skip: requestedIds || wantsPopular || relevancePageIds ? 0 : skip,
        take: requestedIds
          ? requestedIds.length
          : wantsPopular
            ? undefined
            : relevancePageIds
              ? relevancePageIds.length || 1
              : limit,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          brand: { select: { id: true, name: true, slug: true, logo: true } },
          vendor: { select: { id: true, shopName: true, shopSlug: true, isVerified: true } },
          // Powers one grid tile per colour. Only the fields the cards need.
          variants: {
            select: {
              id: true,
              color: true,
              size: true,
              sku: true,
              quantity: true,
              images: true,
              isDefault: true,
              colorFamily: true,
            },
          },
        },
      }),
      relevanceTotal ?? prisma.product.count({ where }),
    ]);

    // Restore the caller's order. A product that no longer exists or is no
    // longer ACTIVE simply drops out rather than leaving a gap.
    let ordered = requestedIds
      ? (requestedIds
          .map((id) => products.find((product) => product.id === id))
          .filter(Boolean) as typeof products)
      : products;

    if (wantsPopular) {
      const rank = new Map(popularIds.map((id, index) => [id, index]));
      const unsold = popularIds.length; // everything with no sales sorts after
      ordered = [...ordered].sort(
        (a, b) => (rank.get(a.id) ?? unsold) - (rank.get(b.id) ?? unsold)
      );
      ordered = ordered.slice(skip, skip + limit);
    }

    // `id: { in: [...] }` comes back in whatever order the database likes, so
    // the ranking has to be reapplied to the rows it returned.
    if (relevancePageIds) {
      const rank = new Map(relevancePageIds.map((id, index) => [id, index]));
      const last = relevancePageIds.length;
      ordered = [...ordered].sort((a, b) => (rank.get(a.id) ?? last) - (rank.get(b.id) ?? last));
    }

    /**
     * One card per colour is a rendering decision, so the API hands over the
     * colours and lets the grid expand them. Variants are dropped from the
     * listing payload afterwards — the grid never reads them, and a catalogue
     * page carrying every size of every product is a lot of bytes for nothing.
     */
    const withColors = ordered.map(({ variants, ...product }) => ({
      ...withoutPrivateFields(product),
      quantity: effectiveStock(product, variants),
      colors: colorCards(product, variants),
    }));

    // 3. Return products with metadata
    //
    // Mirrors 9impression's `X-Total-Count`, so a client written against
    // either backend can read the total the same way. The envelope below stays
    // as it is — every existing caller reads `data.products`.
    res.setHeader('X-Total-Count', String(total));
    res.json({
      success: true,
      message: 'Products fetched',
      data: {
        products: withColors,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('[PRODUCTS] list failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
    });
  }
});

// ── Specific routes MUST come before the /:idOrSlug wildcard ──────────
// Express matches in declaration order, so a route added below the wildcard
// would be swallowed by it and answer "Product not found".

/** A category as the storefront nav and the listing form read it. */
const publicCategoryNode = (node: CategoryNode): Record<string, unknown> => {
  const info = templateInfo(node.resolvedTemplate);
  return {
    id: node.id,
    name: node.name,
    slug: node.slug,
    description: node.description ?? null,
    image: node.image,
    displayOrder: node.displayOrder,
    path: node.path,
    // Resolved through the parents, so a child of Footwear lists as footwear.
    listingTemplate: info?.slug ?? null,
    family: info?.family ?? null,
    optionLabel: info?.optionLabel ?? null,
    children: node.children.filter((child) => child.isActive).map(publicCategoryNode),
  };
};

// @route   GET /api/products/categories/list
// @desc    Category names that currently have something to sell.
//          `?tree=1` instead returns every active category nested under its
//          parent, in display order, with its listing template resolved —
//          what the header nav and the listing form's category step read.
//          An inactive category hides everything under it.
// @access  Public
router.get('/categories/list', async (req: Request, res: Response) => {
  try {
    if (isTruthyFlag(req.query.tree)) {
      const rows = await prisma.category.findMany({ select: CATEGORY_SELECT });
      const tree = buildCategoryTree(rows).filter((node) => node.isActive).map(publicCategoryNode);
      res.json({ success: true, message: 'Categories fetched', data: { categories: tree } });
      return;
    }
    const categories = await prisma.category.findMany({
      where: { products: { some: { status: 'ACTIVE' } } },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, message: 'Categories fetched', data: { categories } });
  } catch (error) {
    console.error('[PRODUCTS] categories failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
});

// @route   GET /api/products/categories/home
// @desc    The homepage "Explore all categories" tiles: every visible
//          category marked showOnHome, at any depth, in homeOrder. A category
//          under a hidden parent is hidden with it. `path` lets the storefront
//          build the tile's link (/products/<dept>/… or /c/…).
// @access  Public
router.get('/categories/home', async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.category.findMany({ select: CATEGORY_SELECT });
    const visible = (nodes: CategoryNode[]): CategoryNode[] =>
      nodes.filter((n) => n.isActive).flatMap((n) => [n, ...visible(n.children)]);
    const tiles = visible(buildCategoryTree(rows))
      .filter((n) => n.showOnHome)
      .sort((a, b) => (a.homeOrder ?? 0) - (b.homeOrder ?? 0) || a.name.localeCompare(b.name))
      .map((n) => ({
        id: n.id,
        name: n.name,
        slug: n.slug,
        image: n.image,
        homeOrder: n.homeOrder ?? 0,
        path: n.path,
      }));
    res.json({ success: true, message: 'Homepage categories fetched', data: { categories: tiles } });
  } catch (error) {
    console.error('[PRODUCTS] home categories failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch homepage categories' });
  }
});

// @route   GET /api/products/sellers/list
// @desc    Shops with something live to sell
// @access  Public
router.get('/sellers/list', async (_req: Request, res: Response) => {
  try {
    const sellers = await prisma.vendorProfile.findMany({
      where: { isActive: true, isVerified: true, products: { some: { status: 'ACTIVE' } } },
      select: {
        id: true,
        shopName: true,
        shopSlug: true,
        shopImage: true,
        isVerified: true,
        rating: true,
        ratingCount: true,
        _count: { select: { products: { where: { status: 'ACTIVE' } } } },
      },
      orderBy: [{ isVerified: 'desc' }, { shopName: 'asc' }],
    });
    res.json({ success: true, message: 'Sellers fetched', data: { sellers } });
  } catch (error) {
    console.error('[PRODUCTS] sellers failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sellers' });
  }
});

// @route   GET /api/products/sellers/:slug
// @desc    One shop, for its storefront page
// @access  Public
//
// Bank details, tax id and earnings are on the same model and are deliberately
// not selected — this is a public endpoint.
router.get('/sellers/:slug', async (req: Request, res: Response) => {
  try {
    const seller = await prisma.vendorProfile.findFirst({
      where: {
        isActive: true,
        isVerified: true,
        OR: [{ shopSlug: req.params.slug }, { id: req.params.slug }],
      },
      select: {
        id: true,
        shopName: true,
        shopSlug: true,
        shopDescription: true,
        shopImage: true,
        shopBanner: true,
        isVerified: true,
        rating: true,
        ratingCount: true,
        createdAt: true,
        _count: { select: { products: { where: { status: 'ACTIVE' } } } },
      },
    });
    if (!seller) {
      res.status(404).json({ success: false, message: 'Seller not found' });
      return;
    }
    res.json({ success: true, message: 'Seller fetched', data: { seller } });
  } catch (error) {
    console.error('[PRODUCTS] seller failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch seller' });
  }
});

// @route   GET /api/products/brands/list
// @desc    Brands that currently have something active to sell
// @access  Public
//
// Only brands with a live product. A facet that lists a brand whose whole
// range is out of stock sends the shopper to an empty grid.
router.get('/brands/list', async (_req: Request, res: Response) => {
  try {
    const brands = await prisma.brand.findMany({
      where: { isActive: true, products: { some: { status: 'ACTIVE' } } },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        isFeatured: true,
        _count: { select: { products: { where: { status: 'ACTIVE' } } } },
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
    res.json({ success: true, message: 'Brands fetched', data: { brands } });
  } catch (error) {
    console.error('[PRODUCTS] brands failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch brands' });
  }
});

// @route   GET /api/products/brands/:slug
// @desc    One brand, for its own storefront page
// @access  Public
router.get('/brands/:slug', async (req: Request, res: Response) => {
  try {
    const brand = await prisma.brand.findFirst({
      where: {
        isActive: true,
        OR: [{ slug: req.params.slug }, { id: req.params.slug }],
      },
      include: { _count: { select: { products: { where: { status: 'ACTIVE' } } } } },
    });
    if (!brand) {
      res.status(404).json({ success: false, message: 'Brand not found' });
      return;
    }
    res.json({ success: true, message: 'Brand fetched', data: { brand } });
  } catch (error) {
    console.error('[PRODUCTS] brand failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch brand' });
  }
});

// @route   GET /api/products/colors/families
// @desc    The fixed colour-family list, for the listing form's dropdown
// @access  Public
router.get('/colors/families', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Colour families', data: { families: COLOUR_FAMILIES } });
});

// @route   GET /api/products/colors/suggest?name=Dusty%20Rose&hex=%23D8A1A4
// @desc    The family a seller's colour name most likely files under
// @access  Public
router.get('/colors/suggest', (req: Request, res: Response) => {
  const name = isNonEmptyString(req.query.name) ? req.query.name : '';
  const hex = isNonEmptyString(req.query.hex) ? req.query.hex : null;
  const family = suggestFamily(name, hex);
  res.json({ success: true, message: 'Suggestion', data: { family: family?.name ?? null } });
});

// @route   GET /api/products/colors/list
// @desc    Colour facets for the shop filter
// @access  Public
//
// Only colours a shopper can actually land on. Offering a facet drawn from the
// whole table is how a filter ends up returning an empty grid.
//
// Facets are colour families (the fixed list), each with its canonical swatch
// and how many shoppable products carry it — within a category when one is
// given. `colors` keeps the plain list of names for older callers.
router.get('/colors/list', async (req: Request, res: Response) => {
  try {
    const category = isNonEmptyString(req.query.category) ? req.query.category.trim() : null;
    const scope = category ? categoryScope(await prisma.category.findMany({ select: CATEGORY_SELECT }), category) : [];
    const products = await prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        AND: [STOREFRONT_VISIBILITY],
        ...(category ? { categoryId: { in: scope } } : {}),
      },
      select: { colorFamily: true, variants: { select: { colorFamily: true } } },
    });

    const counts = new Map<string, number>();
    for (const product of products) {
      const families = new Set(
        [product.colorFamily, ...product.variants.map((v) => v.colorFamily)].filter(
          (f): f is string => Boolean(f)
        )
      );
      for (const family of families) counts.set(family, (counts.get(family) ?? 0) + 1);
    }
    // In the list's own order (darks, neutrals, then the spectrum), Multi last.
    const families = COLOUR_FAMILIES.filter((f) => counts.has(f.name)).map((f) => ({
      name: f.name,
      slug: f.slug,
      hex: f.hex,
      count: counts.get(f.name)!,
    }));
    res.json({
      success: true,
      message: 'Colours fetched',
      data: { families, colors: families.map((f) => f.name) },
    });
  } catch (error) {
    console.error('[PRODUCTS] colours failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch colours' });
  }
});

// @route   GET /api/products/facets/list
// @desc    Size and "ideal for" facets for the shop filter
// @access  Public
//
// Like colours, only values a shopper can land on: sizes that live, in-stock
// variants carry, within the category when one is given. Sizes come back in
// size-chart order with the group each belongs to, so the filter can show
// "Baby" and "Kids" sizes the way the listing form groups them.
router.get('/facets/list', async (req: Request, res: Response) => {
  try {
    const category = isNonEmptyString(req.query.category) ? req.query.category.trim() : null;
    const rows = category ? await prisma.category.findMany({ select: CATEGORY_SELECT }) : [];
    const scope = category ? categoryScope(rows, category) : [];
    const productWhere: Prisma.ProductWhereInput = {
      status: 'ACTIVE',
      AND: [STOREFRONT_VISIBILITY],
      ...(category ? { categoryId: { in: scope } } : {}),
    };
    // The category's template decides which attribute facets apply (upper
    // material for footwear, connectivity for electronics) and what the size
    // facet is called.
    // The admin's own fields for this category join them; a category with
    // fields but no template is presented like the General template.
    const extras = await categoryExtras(scope[0]);
    const hasExtras = extras.columns.length > 0 || Boolean(extras.optionLabel);
    const template = templateInfo(
      category ? (resolveTemplate(rows, scope[0]) ?? (hasExtras ? 'general' : null)) : null,
      extras
    );
    const attributeColumns = template ? filterableAttributes(template.slug, extras.columns) : [];

    const [variants, ages, attributeRows] = await Promise.all([
      prisma.productVariant.findMany({
        where: { quantity: { gt: 0 }, product: productWhere },
        select: { size: true },
        distinct: ['size'],
      }),
      prisma.product.findMany({
        where: { ...productWhere, ageGroup: { not: null } },
        select: { ageGroup: true },
        distinct: ['ageGroup'],
      }),
      attributeColumns.length
        ? prisma.product.findMany({ where: productWhere, select: { attributes: true }, take: 2000 })
        : Promise.resolve([] as Array<{ attributes: Prisma.JsonValue }>),
    ]);

    // Only values some live product carries, in the template's own order.
    // A multi-select field contributes each value of its list; a number field
    // has no list, so its values come back distinct and in numeric order.
    const attributes = attributeColumns
      .map((column) => {
        const present = new Set(
          attributeRows
            .flatMap((row) => {
              const value = (row.attributes as Record<string, unknown> | null)?.[column.key];
              return Array.isArray(value) ? value : [value];
            })
            .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
        );
        const ordered = column.options.filter((option) => present.has(option));
        const extra = [...present]
          .filter((value) => !column.options.includes(value))
          .sort((a, b) => (column.kind === 'number' ? Number(a) - Number(b) : a.localeCompare(b)));
        return {
          key: column.key,
          label: column.label,
          values: [...ordered, ...extra],
          ...(column.unit ? { unit: column.unit } : {}),
        };
      })
      .filter((facet) => facet.values.length > 0);

    const rank = (value: string) => {
      const index = SIZE_ORDER.findIndex((s) => s.toLowerCase() === value.toLowerCase());
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    const sizes = [...new Set(variants.map((v) => v.size?.trim()).filter((s): s is string => Boolean(s)))]
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      .map((value) => ({ value, group: sizeGroupOf(value) }));

    const ageGroups = ages
      .map((a) => a.ageGroup!)
      .sort()
      .map((value) => ({ value, label: value.split('-').pop()!.trim() || value }));

    res.json({
      success: true,
      message: 'Facets fetched',
      data: { sizes, ageGroups, attributes, optionLabel: template?.optionLabel ?? 'Size' },
    });
  } catch (error) {
    console.error('[PRODUCTS] facets failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch facets' });
  }
});

/** Same buckets as the listing form's size groups. */
const sizeGroupOf = (size: string): string => {
  if (/^UK \d/i.test(size)) return 'UK sizes';
  if (/^\d+(\.\d+)?(-\d+(\.\d+)?)?M$/i.test(size) || /baby|newborn|upto/i.test(size)) return 'Baby';
  if (/^\d+(\.\d+)?(-\d+(\.\d+)?)?Y$/i.test(size)) return 'Kids';
  if (/^\d+\/\d+$/.test(size) || /^\d+$/.test(size)) return 'Waist / length';
  if (/^([3-9]|1\d)XL$/i.test(size)) return 'Plus';
  return 'Adult';
};

/** Everything a suggestion row shows, plus the fields the ranker reads. */
const SUGGESTION_SELECT = {
  id: true,
  name: true,
  slug: true,
  price: true,
  originalPrice: true,
  thumbnail: true,
  sku: true,
  shortDescription: true,
  description: true,
  color: true,
  material: true,
  rating: true,
  isFeatured: true,
  category: { select: { name: true, slug: true } },
  brand: { select: { name: true } },
} satisfies Prisma.ProductSelect;

type SuggestionRow = Prisma.ProductGetPayload<{ select: typeof SUGGESTION_SELECT }>;

/** The wire shape. The ranking fields stay on the server where they belong. */
const toSuggestion = (product: SuggestionRow) => ({
  id: product.id,
  name: product.name,
  slug: product.slug,
  price: product.price,
  originalPrice: product.originalPrice,
  thumbnail: product.thumbnail,
  category: product.category ? { name: product.category.name, slug: product.category.slug } : null,
});

// @route   GET /api/products/search/q?q=&limit=
// @desc    Ranked typeahead over name, SKU, category, brand and description
// @access  Public
//
// Deliberately lean and capped: this backs a search overlay that fires as
// someone types, so it returns the few fields a suggestion row shows rather
// than whole product records.
//
// Two passes, in this order because the common one must not pay for the rare
// one. The first is the listing's own filter and the listing's own scorer, so
// the dropdown and the results page cannot disagree about what the best match
// is. The second runs only when the first found nothing: a trigram sweep that
// turns "polp" into the polo. A query that already has answers never reaches
// it, and a query that does not is exactly where a shopper needs the help.
router.get('/search/q', async (req: Request, res: Response) => {
  try {
    const phrase = String(req.query.q ?? '').trim().toLowerCase();
    const requested = Number(req.query.limit);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 20) : 8;

    const tokens = phrase.length > 0 ? searchTokens(phrase) : [];
    if (tokens.length === 0) {
      res.json({ success: true, message: 'Empty query', data: { items: [], fuzzy: false } });
      return;
    }

    // Same two conditions the listing applies, so the dropdown can never
    // suggest something the results page would then refuse to show.
    const visible: Prisma.ProductWhereInput = { status: 'ACTIVE', AND: [STOREFRONT_VISIBILITY] };

    const matches = await prisma.product.findMany({
      where: { status: 'ACTIVE', AND: [STOREFRONT_VISIBILITY, productSearchFilter(tokens)] },
      select: SUGGESTION_SELECT,
      // Enough to rank meaningfully without reading the catalogue for a
      // one-letter query. The scorer decides which of these the shopper sees.
      take: 60,
    });

    if (matches.length > 0) {
      const items = rankByRelevance(matches, tokens, phrase).slice(0, limit).map(toSuggestion);
      res.json({ success: true, message: 'Search results', data: { items, fuzzy: false } });
      return;
    }

    /**
     * Nothing matched literally. A one- or two-letter query that finds nothing
     * is a shopper still typing, not a misspelling, so leave it alone rather
     * than guessing wildly from two characters.
     */
    if (phrase.length < 3) {
      res.json({ success: true, message: 'No results', data: { items: [], fuzzy: false } });
      return;
    }

    const catalogue = await prisma.product.findMany({
      where: visible,
      select: SUGGESTION_SELECT,
      orderBy: { createdAt: 'desc' },
      take: FUZZY_SCAN_CAP,
    });

    const near = catalogue
      .map((product) => ({ product, score: fuzzyScore(product, phrase) }))
      .filter((entry) => entry.score >= FUZZY_THRESHOLD)
      .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
      .slice(0, limit)
      .map((entry) => toSuggestion(entry.product));

    res.json({
      success: true,
      message: near.length > 0 ? 'Near matches' : 'No results',
      data: { items: near, fuzzy: near.length > 0 },
    });
  } catch (error) {
    console.error('[PRODUCTS] search failed:', error);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
});

// @route   GET /api/products/:idOrSlug
// @desc    Get single product by ID or slug
// @access  Public
router.get('/:idOrSlug', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { idOrSlug } = req.params;

    const product = await prisma.product.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { id: true, name: true, slug: true, logo: true, description: true } },
        vendor: {
          select: {
            id: true,
            shopName: true,
            shopSlug: true,
            shopImage: true,
            isVerified: true,
            isActive: true,
            rating: true,
            ratingCount: true,
          },
        },
        variants: true,
        customizations: true,
        bulkPricings: true,
      },
    });

    // Non-admins can only see ACTIVE products from a live shop. Without the
    // second half, a suspended seller's product kept a working page — with
    // metadata, structured data and an add-to-cart button.
    const shopIsLive =
      !product?.vendor || (product.vendor.isActive && product.vendor.isVerified);
    const visible =
      product && product.status === 'ACTIVE' && product.moderationStatus === 'APPROVED' && shopIsLive;

    if (!visible && req.user?.role !== 'ADMIN') {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    // The admin edit form and the owning seller read this route too, and they
    // need the cost price back; everyone else gets the shopper's view.
    const isOwner =
      req.user?.role === 'VENDOR' &&
      Boolean(product.vendorId) &&
      (await prisma.vendorProfile.count({ where: { id: product.vendorId!, userId: req.userId } })) > 0;
    const canSeePrivate = req.user?.role === 'ADMIN' || isOwner;

    // The other colourways of this design: same colour group, same shop, and
    // only the ones a shopper could open.
    const colourSiblings = product.colourGroupId
      ? await prisma.product.findMany({
          where: {
            colourGroupId: product.colourGroupId,
            vendorId: product.vendorId,
            status: 'ACTIVE',
            AND: [STOREFRONT_VISIBILITY],
          },
          orderBy: { createdAt: 'asc' },
          take: 12,
          select: { id: true, slug: true, name: true, color: true, brandColour: true, thumbnail: true },
        })
      : [];
    const categoryRows = await prisma.category.findMany({ select: CATEGORY_SELECT });

    res.json({
      success: true,
      message: 'Product fetched',
      data: {
        product: {
          ...(canSeePrivate ? product : withoutPrivateFields(product)),
          quantity: effectiveStock(product, product.variants),
          colourSiblings: colourSiblings.map((s) => ({
            id: s.id,
            slug: s.slug,
            name: s.name,
            colour: s.brandColour || s.color,
            thumbnail: s.thumbnail,
            current: s.id === product.id,
          })),
          // Colours with their sizes and per-colour gallery, alongside the raw
          // variants the page already uses. Same shape the grid reads, so a
          // card and the page it opens agree on what a colour is.
          colors: colorDetails(product, product.variants),
          // How to present it: what the variant option is called ("UK size"),
          // whether it is clothing (size guide), and attribute names for the
          // specification table. A product listed before article types falls
          // back to its category's template. The category's own fields add
          // their labels and units ("Screen size", "inch").
          listing: await (async () => {
            const extras = await categoryExtras(product.categoryId);
            return (
              templateInfo(product.articleType, extras) ??
              templateInfo(
                resolveTemplate(categoryRows, product.categoryId) ??
                  (extras.columns.length ? 'general' : null),
                extras
              )
            );
          })(),
          // Department down to the product's own category, for the breadcrumb:
          // Electronics / Television / LED TV rather than just "LED TV".
          categoryTrail: (() => {
            const byId = new Map(categoryRows.map((row) => [row.id, row]));
            const trail: Array<{ id: string; name: string; slug: string }> = [];
            const seen = new Set<string>();
            for (let at = byId.get(product.categoryId); at && !seen.has(at.id); at = at.parentId ? byId.get(at.parentId) : undefined) {
              seen.add(at.id);
              trail.unshift({ id: at.id, name: at.name, slug: at.slug });
            }
            return trail.map((step, index) => ({ ...step, path: trail.slice(0, index + 1).map((t) => t.slug) }));
          })(),
        },
      },
    });
  } catch (error) {
    console.error('[PRODUCTS] get failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
    });
  }
});

/**
 * A seller may list under an approved brand, or under one their own shop added
 * that is still waiting for approval. Without this, any shop could put its
 * listings under another shop's unapproved brand — or anyone's.
 */
async function assertBrandUsable(brandId: unknown, user: { userId: string; role?: string }): Promise<void> {
  if (user.role === 'ADMIN' || !isNonEmptyString(brandId)) return;
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { isActive: true, status: true, ownerVendor: { select: { userId: true } } },
  });
  if (!brand) throw new HttpError(400, 'brandId does not match an existing brand');
  if (!brand.isActive && brand.status === 'REJECTED') {
    throw new HttpError(403, 'That brand was not approved. Pick another brand, or resubmit it under Brands.');
  }
  if (!brand.isActive && brand.ownerVendor?.userId !== user.userId) {
    throw new HttpError(403, 'That brand is not approved yet, and only the shop that added it can list under it.');
  }
}

// @route   POST /api/products
// @desc    Create new product (Admin/Vendor)
// @access  Private
router.post('/', authMiddleware, canManageProducts, async (req: AuthRequest, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { data, errors } = pickProductFields(body);

    // Ownership comes from the session, never the body: otherwise one shop
    // could list a product under another shop's name.
    data.vendorId = await resolveOwnerForCreate(
      { userId: req.userId!, role: req.user?.role },
      body.vendorId
    );

    for (const field of ['name', 'slug', 'sku', 'categoryId'] as const) {
      if (!isNonEmptyString(data[field])) errors.push(`${field} is required`);
    }
    if (typeof data.price !== 'number') errors.push('price is required and must be a number');

    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }

    const category = await prisma.category.findUnique({ where: { id: data.categoryId as string } });
    if (!category) {
      res.status(400).json({ success: false, message: 'categoryId does not match an existing category' });
      return;
    }
    await assertBrandUsable(data.brandId, { userId: req.userId!, role: req.user?.role });

    // Two shops will both call something "cotton-kurta". The URL slug is
    // platform-wide, so a clash gets a suffix instead of a refusal.
    data.slug = await uniqueProductSlug(data.slug as string);

    // A seller's new listing waits for the platform to check it. An admin
    // creating a product is the check.
    const isSeller = req.user?.role !== 'ADMIN';
    if (isSeller) {
      data.moderationStatus = 'PENDING';
      data.moderationNote = null;
    }

    const listingErrors = prepareListingWrite(data, null, await categoryColumns(data.categoryId));
    if (listingErrors.length > 0) {
      res.status(400).json({ success: false, message: listingErrors.join('. ') });
      return;
    }
    await guardCustomizable(data);

    const product = await prisma.product.create({
      data: data as unknown as Prisma.ProductUncheckedCreateInput,
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
    await ensureDefaultCustomizations(product.id);

    res.status(201).json({
      success: true,
      message: isSeller
        ? 'Product saved. It will go live once our team has reviewed it.'
        : 'Product created',
      data: { product },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const dup = await describeDuplicate(error.meta?.target, req.body?.sku, { userId: req.userId, role: req.user?.role });
      res.status(409).json({ success: false, ...dup });
      return;
    }
    if (isLiveCheckError(error)) {
      res.status(409).json({ success: false, message: error.message, missing: error.missing });
      return;
    }
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    console.error('[PRODUCTS] create failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product',
    });
  }
});

// @route   PUT /api/products/:id
// @desc    Update product (Admin/Vendor)
// @access  Private
router.put('/:id', authMiddleware, canManageProducts, async (req: AuthRequest, res: Response) => {
  try {
    await assertCanModifyProduct({ userId: req.userId!, role: req.user?.role }, req.params.id);

    const body = (req.body ?? {}) as Record<string, unknown>;
    const { data, errors } = pickProductFields(body);

    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: 'No valid fields provided to update' });
      return;
    }

    if (isNonEmptyString(data.categoryId)) {
      const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
      if (!category) {
        res.status(400).json({ success: false, message: 'categoryId does not match an existing category' });
        return;
      }
    }
    await assertBrandUsable(data.brandId, { userId: req.userId!, role: req.user?.role });

    // Without this, a seller could get a harmless listing approved and then
    // swap in different photos and text.
    // Only a real change counts. The listing form sends every field on every
    // save, so "the field was in the request" would re-queue an approved
    // listing each time a seller fixed a typo in the price.
    const current = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: Object.fromEntries(FIELDS_NEEDING_REVIEW.map((f) => [f, true])) as Prisma.ProductSelect,
    });
    const changed = (field: (typeof FIELDS_NEEDING_REVIEW)[number]): boolean =>
      field in data &&
      JSON.stringify(data[field] ?? null) !==
        JSON.stringify((current as Record<string, unknown> | null)?.[field] ?? null);
    const sentBackForReview = req.user?.role !== 'ADMIN' && FIELDS_NEEDING_REVIEW.some(changed);
    if (sentBackForReview) {
      data.moderationStatus = 'PENDING';
      data.moderationNote = null;
    }

    const stored = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { variants: true },
    });
    const listingErrors = prepareListingWrite(
      data,
      stored as unknown as Record<string, unknown>,
      await categoryColumns(data.categoryId ?? stored?.categoryId)
    );
    if (listingErrors.length > 0) {
      res.status(400).json({ success: false, message: listingErrors.join('. ') });
      return;
    }
    await guardCustomizable(data, stored);

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: data as unknown as Prisma.ProductUncheckedUpdateInput,
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
    await ensureDefaultCustomizations(product.id);

    res.json({
      success: true,
      message: sentBackForReview
        ? 'Product updated. The changes will show once our team has reviewed them.'
        : 'Product updated',
      data: { product },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        res.status(404).json({ success: false, message: 'Product not found' });
        return;
      }
      if (error.code === 'P2002') {
        const dup = await describeDuplicate(error.meta?.target, req.body?.sku, { userId: req.userId, role: req.user?.role });
        res.status(409).json({ success: false, ...dup });
        return;
      }
    }
    if (isLiveCheckError(error)) {
      res.status(409).json({ success: false, message: error.message, missing: error.missing });
      return;
    }
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    console.error('[PRODUCTS] update failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product',
    });
  }
});

// @route   PUT /api/products/:id/customizations
// @desc    Replace a listing's print / embroidery options (clothing only)
// @access  Private — the owning seller, or an admin
router.put('/:id/customizations', authMiddleware, canManageProducts, async (req: AuthRequest, res: Response) => {
  try {
    await assertCanModifyProduct({ userId: req.userId!, role: req.user?.role }, req.params.id);
    const { data, errors } = parseCustomizationRows(req.body?.customizations);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }
    const customizations = await replaceCustomizations(req.params.id, data);
    void revalidateCatalog('products');
    res.json({ success: true, message: 'Customisation options saved', data: { customizations } });
  } catch (error) {
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    console.error('[PRODUCTS] customizations save failed:', error);
    res.status(500).json({ success: false, message: 'Could not save those options' });
  }
});

// @route   DELETE /api/products/:id
// @desc    Delete product (Admin/Vendor) — soft delete to preserve order history
// @access  Private
router.delete('/:id', authMiddleware, canManageProducts, async (req: AuthRequest, res: Response) => {
  try {
    await assertCanModifyProduct({ userId: req.userId!, role: req.user?.role }, req.params.id);

    await prisma.product.update({
      where: { id: req.params.id },
      data: { status: 'DISCONTINUED' },
    });

    res.json({
      success: true,
      message: 'Product discontinued',
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    console.error('[PRODUCTS] delete failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
    });
  }
});

// @route   GET /api/products/:id/reviews
// @desc    Get product reviews
// @access  Public
router.get('/:id/reviews', async (req: Request, res: Response) => {
  try {
    const product = await findProductByIdOrSlug(req.params.id);
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    const reviews = await prisma.review.findMany({
      where: { productId: product.id, isPublished: true },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    });

    res.json({
      success: true,
      message: 'Reviews fetched',
      data: { reviews },
    });
  } catch (error) {
    console.error('[PRODUCTS] reviews failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews',
    });
  }
});

// @route   POST /api/products/:id/reviews
// @desc    Add or update product review (one per user per product)
// @access  Private
router.post('/:id/reviews', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rating, title, comment } = req.body ?? {};

    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      res.status(400).json({ success: false, message: 'rating must be an integer between 1 and 5' });
      return;
    }
    if (title !== undefined && typeof title !== 'string') {
      res.status(400).json({ success: false, message: 'title must be a string' });
      return;
    }
    if (comment !== undefined && typeof comment !== 'string') {
      res.status(400).json({ success: false, message: 'comment must be a string' });
      return;
    }

    const product = await findProductByIdOrSlug(req.params.id);
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    const userId = req.userId!;

    // Verified purchase: the user has a DELIVERED order containing this product.
    const deliveredItem = await prisma.orderItem.findFirst({
      where: {
        productId: product.id,
        order: { userId, status: 'DELIVERED' },
      },
    });

    const review = await prisma.review.upsert({
      where: { productId_userId: { productId: product.id, userId } },
      update: {
        rating: numericRating,
        title: title ?? null,
        comment: comment ?? null,
        isVerified: Boolean(deliveredItem),
      },
      create: {
        productId: product.id,
        userId,
        rating: numericRating,
        title: title ?? null,
        comment: comment ?? null,
        isVerified: Boolean(deliveredItem),
      },
    });

    await recomputeProductRating(product.id);

    res.status(201).json({
      success: true,
      message: 'Review saved',
      data: { review },
    });
  } catch (error) {
    console.error('[PRODUCTS] add review failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add review',
    });
  }
});

export default router;
