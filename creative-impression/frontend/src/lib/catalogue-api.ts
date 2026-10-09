'use client';

import axios from 'axios';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * The listing catalogue: what a product of each article type must carry.
 *
 * Generated server-side from Myntra's SKU templates, so the form, the
 * validator and the export all read one source. Specs are ~50KB and never
 * change during a session, so each is fetched once and kept in memory.
 */

export type SpecGroup = 'business' | 'discoverability' | 'sizing' | 'imagery';
export type SpecKind =
  | 'text'
  | 'longtext'
  | 'select'
  | 'multiselect'
  | 'number'
  | 'boolean'
  | 'measurement'
  | 'image'
  | 'date';
export type SpecScope = 'product' | 'variant' | 'attribute' | 'measurement' | 'image';

export interface SpecColumn {
  key: string;
  header: string;
  label: string;
  group: SpecGroup;
  required: boolean;
  kind: SpecKind;
  scope: SpecScope;
  /** Product/variant field the value is stored in (scope product/variant). */
  field?: string;
  options?: string[];
  /** Other measurement keys that satisfy this one (bust or chest). */
  anyOf?: string[];
  /** Shoppers can filter the storefront by this attribute. */
  filterable?: boolean;
  /** Shown after a number field's input: "inch", "Hz". */
  unit?: string;
  helpText?: string;
  /** Set on a field the admin added to a category rather than the template. */
  source?: { categoryId: string; categoryName: string };
}

/**
 * `apparel`: Myntra clothing templates, with a size chart, measurements and a
 * look shot. `general`: everything else (footwear, electronics, home…), whose
 * one variant option is named by the template ("UK size", "Variant").
 */
export type TemplateFamily = 'apparel' | 'general';

export interface ArticleTypeSummary {
  articleType: string;
  slug: string;
  family: TemplateFamily;
  optionLabel: string;
  columns: number;
  required: number;
}

export interface ArticleSpec {
  articleType: string;
  slug: string;
  family: TemplateFamily;
  /** What the variant `size` column holds, e.g. "UK size". */
  optionLabel: string;
  sizes: string[];
  /** No list to pick from: the seller types option values ("128 GB"). */
  freeOptions: boolean;
  /** The category's suggested option values, offered as quick picks. */
  optionValues?: string[];
  columns: SpecColumn[];
}

/** A category as the listing form's category step shows it. */
export interface CategoryChoice {
  id: string;
  name: string;
  slug: string;
  depth: number;
  isActive?: boolean;
  /** The template sellers in this category list with, inherited from parents. */
  listingTemplate: string | null;
}

interface CategoryTreeNode {
  id: string;
  name: string;
  slug: string;
  listingTemplate: string | null;
  children: CategoryTreeNode[];
}

/**
 * Every active category, nested, flattened parents-first with a depth — the
 * seller's category picker. Sellers cannot read the admin table, and the old
 * public list held only categories that already had products, so a new
 * department (Footwear, before its first listing) could never be chosen.
 */
export async function listCategoryChoices(): Promise<CategoryChoice[]> {
  try {
    const res = await apiClient.get('/products/categories/list', { params: { tree: 1 } });
    const roots = (res.data?.data?.categories ?? []) as CategoryTreeNode[];
    const flat: CategoryChoice[] = [];
    const walk = (nodes: CategoryTreeNode[], depth: number) =>
      nodes.forEach((node) => {
        flat.push({
          id: node.id,
          name: node.name,
          slug: node.slug,
          depth,
          listingTemplate: node.listingTemplate,
        });
        walk(node.children ?? [], depth + 1);
      });
    walk(roots, 0);
    return flat;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load categories.'));
  }
}

export interface BusinessDetails {
  manufacturerDetails: string | null;
  packerDetails: string | null;
  importerDetails: string | null;
  countriesOfOrigin: string[];
  brandId: string | null;
  hsn: string | null;
}

/** Marketplace listing fields a product carries (Myntra template columns). */
export interface ListingFields {
  articleType?: string | null;
  styleGroupId?: string | null;
  /** Myntra "Color Variant GroupId": shared by every colourway of one design. */
  colourGroupId?: string | null;
  displayName?: string | null;
  listViewName?: string | null;
  brandColour?: string | null;
  primaryColour?: string | null;
  secondaryColour?: string | null;
  tertiaryColour?: string | null;
  ageGroup?: string | null;
  fashionType?: string | null;
  usage?: string | null;
  season?: string | null;
  year?: number | null;
  hsn?: string | null;
  countriesOfOrigin?: string[];
  manufacturerDetails?: string | null;
  packerDetails?: string | null;
  importerDetails?: string | null;
  styleNote?: string | null;
  materialCare?: string | null;
  sizeAndFit?: string | null;
  tags?: string[];
  measurementBasis?: string | null;
  netQuantity?: number | null;
  netQuantityUnit?: string | null;
  numberOfItems?: string | null;
  multipackSet?: string | null;
  packageContains?: string | null;
  bisCertificate?: { number?: string; imageUrl?: string; expiryDate?: string } | null;
  /** Angle → url. The server rebuilds `images` in angle order from these. */
  imageAngles?: Record<string, string> | null;
  /** Type-specific attributes keyed by catalogue key. */
  attributes?: Record<string, string | string[]> | null;
}

/** Per-size listing values. */
export interface VariantListingFields {
  standardSize?: string | null;
  sizeOnLabel?: boolean | null;
  gtin?: string | null;
  /** Catalogue measurement key → inches. */
  measurements?: Record<string, number> | null;
  /** Extra option values beside the size column, e.g. {"Storage": "128 GB"}. */
  options?: Record<string, string> | null;
}

/** One thing the server says a live listing still lacks. */
export interface MissingField {
  key: string;
  label: string;
  group: string;
}

let typesCache: Promise<ArticleTypeSummary[]> | null = null;
const specCache = new Map<string, Promise<ArticleSpec>>();

export function listArticleTypes(): Promise<ArticleTypeSummary[]> {
  if (!typesCache) {
    typesCache = apiClient
      .get('/catalogue/article-types')
      .then((res) => (res.data?.data?.articleTypes ?? []) as ArticleTypeSummary[])
      .catch((error) => {
        typesCache = null;
        throw new Error(getApiErrorMessage(error, 'Could not load the article types.'));
      });
  }
  return typesCache;
}

/**
 * A template's spec. With the chosen category, the fields the admin defined on
 * it (and its parents) are merged into the attributes, and its variant option
 * name and suggested values replace the template's.
 */
export function getArticleSpec(typeOrSlug: string, categoryId?: string | null): Promise<ArticleSpec> {
  const key = `${typeOrSlug.trim().toLowerCase()}@${categoryId ?? ''}`;
  let cached = specCache.get(key);
  if (!cached) {
    cached = apiClient
      .get(`/catalogue/article-types/${encodeURIComponent(typeOrSlug)}`, {
        params: categoryId ? { categoryId } : undefined,
      })
      .then((res) => {
        const spec = res.data?.data?.spec as ArticleSpec | undefined;
        if (!spec) throw new Error('That article type has no listing template.');
        return spec;
      })
      .catch((error) => {
        specCache.delete(key);
        throw new Error(getApiErrorMessage(error, 'Could not load that article type.'));
      });
    specCache.set(key, cached);
  }
  return cached;
}

/** Manufacturer, packer, importer and origin from the caller's last listing. */
export async function getLastBusinessDetails(): Promise<BusinessDetails | null> {
  try {
    const res = await apiClient.get('/catalogue/last-business-details');
    return (res.data?.data?.details ?? null) as BusinessDetails | null;
  } catch {
    // Prefill is a convenience; without it the fields simply start empty.
    return null;
  }
}

/**
 * Brands a seller can pick. Sellers cannot read the admin brand table, so
 * this is the public list (brands with something live).
 */
export async function listPublicBrands(): Promise<Array<{ id: string; name: string }>> {
  try {
    // Every active brand. The public directory only lists brands that already
    // have live products, which left a new seller unable to pick theirs.
    const res = await apiClient.get('/catalogue/brands');
    return (res.data?.data?.brands ?? []) as Array<{ id: string; name: string }>;
  } catch {
    return [];
  }
}

/** Add a brand (or get the existing one with that name). */
export async function addBrand(name: string): Promise<{ id: string; name: string }> {
  try {
    const res = await apiClient.post('/catalogue/brands', { name });
    return res.data?.data?.brand as { id: string; name: string };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not add that brand.'));
  }
}

/**
 * A product save that failed, keeping what the generic wrappers drop: the
 * status and, on a 409 from the go-live check, the list of missing fields.
 */
export class ListingSaveError extends Error {
  status?: number;
  missing: MissingField[];
  /** The listing that already holds this article number, when it is the caller's. */
  conflict?: { id: string; name: string; status: string };
  constructor(
    message: string,
    status?: number,
    missing: MissingField[] = [],
    conflict?: { id: string; name: string; status: string }
  ) {
    super(message);
    this.status = status;
    this.missing = missing;
    this.conflict = conflict;
  }
}

export interface SavedProduct {
  id: string;
  slug: string;
  sku: string;
  status: string;
  moderationStatus?: string;
}

/**
 * Create or update a product for either console.
 *
 * Admin writes go to `/admin/products`; a seller's go to the public
 * `/products` routes, which take the owning shop from the session.
 */
export async function saveListingProduct(
  mode: 'admin' | 'seller',
  id: string | null,
  body: Record<string, unknown>
): Promise<{ product: SavedProduct; message: string }> {
  const base = mode === 'admin' ? '/admin/products' : '/products';
  try {
    const res = id
      ? await apiClient.put(`${base}/${encodeURIComponent(id)}`, body)
      : await apiClient.post(base, body);
    return {
      product: res.data?.data?.product as SavedProduct,
      message: String(res.data?.message ?? ''),
    };
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const data = axios.isAxiosError(error)
      ? (error.response?.data as
          | { missing?: MissingField[]; conflict?: { id: string; name: string; status: string } }
          | undefined)
      : undefined;
    throw new ListingSaveError(
      getApiErrorMessage(error, 'Could not save the listing.'),
      status,
      Array.isArray(data?.missing) ? data.missing : [],
      data?.conflict
    );
  }
}
