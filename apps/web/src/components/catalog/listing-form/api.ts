import {
  createVariant,
  deleteVariant,
  getProduct,
  listProducts,
  saveCustomizations,
  updateVariant,
  type ProductCustomizationRow,
} from '@/lib/admin-products';
import { saveListingProduct, type SavedProduct } from '@/lib/catalogue-api';
import {
  createSellerVariant,
  deleteSellerVariant,
  getSellerProduct,
  getSellerProducts,
  saveSellerCustomizations,
  updateSellerVariant,
  type SellerCustomization,
} from '@/lib/seller-api';
import type { FormMode, LoadedProduct, LoadedVariant } from './model';

/**
 * Every request the listing form makes about a product, behind one interface.
 *
 * Each console gets a default set (`listingApi(mode)`); a page can replace any
 * call through `ListingForm`'s `api` prop — the staff console points them at
 * `/admin/products…` the same way — without the form knowing which routes
 * exist. Pass a stable object (module scope or memoised): the form re-reads
 * the product when it changes.
 */
export interface ListingFormApi {
  loadProduct: (id: string) => Promise<{
    product: LoadedProduct;
    variants: LoadedVariant[];
    customizations: ProductCustomizationRow[];
  }>;
  saveProduct: (id: string | null, body: Record<string, unknown>) => Promise<{ product: SavedProduct; message: string }>;
  createVariant: (productId: string, body: Record<string, unknown>) => Promise<{ id: string }>;
  updateVariant: (productId: string, variantId: string, body: Record<string, unknown>) => Promise<void>;
  deleteVariant: (productId: string, variantId: string) => Promise<void>;
  saveCustomizations: (productId: string, rows: ProductCustomizationRow[]) => Promise<ProductCustomizationRow[]>;
  /** "Copy from an existing product": a handful of matches by name or SKU. */
  searchProducts: (query: string) => Promise<Array<{ id: string; name: string; sku: string }>>;
}

/**
 * The API stores an option's extra cost in paise with an upper-case type; the
 * editor works in rupees with the old lower-case names. Rows already in the
 * editor's shape pass through.
 */
type AnyCustomization = Partial<Omit<ProductCustomizationRow, 'type'>> &
  Partial<Omit<SellerCustomization, 'type'>> & { type?: string };

export function toEditorRow(row: AnyCustomization): ProductCustomizationRow {
  return {
    id: row.id,
    name: row.name ?? '',
    type: String(row.type ?? 'text').toLowerCase() as ProductCustomizationRow['type'],
    isRequired: Boolean(row.isRequired),
    options: row.options ?? null,
    additionalCost:
      typeof row.additionalPaise === 'number' ? row.additionalPaise / 100 : Number(row.additionalCost ?? 0),
    maxCharacters: row.maxCharacters ?? null,
  };
}

export function toApiCustomization(row: ProductCustomizationRow): SellerCustomization {
  const options = Array.isArray(row.options)
    ? row.options
    : typeof row.options === 'string' && row.options
      ? (() => {
          try {
            const parsed = JSON.parse(row.options as string);
            return Array.isArray(parsed) ? parsed.map(String) : [];
          } catch {
            return [];
          }
        })()
      : [];
  return {
    name: row.name,
    type: row.type.toUpperCase(),
    isRequired: row.isRequired,
    options: options.length ? options : null,
    additionalPaise: Math.round((Number(row.additionalCost) || 0) * 100),
    maxCharacters: row.maxCharacters,
  };
}

const customizationsOf = (product: unknown): ProductCustomizationRow[] =>
  (((product as { customizations?: AnyCustomization[] }).customizations ?? []) as AnyCustomization[]).map(toEditorRow);

const ADMIN: ListingFormApi = {
  loadProduct: async (id) => {
    const product = (await getProduct(id)) as unknown as LoadedProduct & { variants?: LoadedVariant[] };
    return { product, variants: product.variants ?? [], customizations: customizationsOf(product) };
  },
  saveProduct: (id, body) => saveListingProduct('admin', id, body),
  createVariant: (pid, body) => createVariant(pid, body as unknown as Parameters<typeof createVariant>[1]),
  updateVariant: async (pid, vid, body) => {
    await updateVariant(pid, vid, body as Parameters<typeof updateVariant>[2]);
  },
  deleteVariant: (pid, vid) => deleteVariant(pid, vid),
  saveCustomizations: (pid, rows) => saveCustomizations(pid, rows, 'admin'),
  searchProducts: async (query) => {
    const page = await listProducts({ search: query, limit: 8 });
    return page.products.map((p) => ({ id: p.id, name: p.name, sku: p.sku }));
  },
};

const SELLER: ListingFormApi = {
  loadProduct: async (id) => {
    const product = await getSellerProduct(id);
    return {
      product: product as unknown as LoadedProduct,
      variants: (product.variants ?? []) as unknown as LoadedVariant[],
      customizations: customizationsOf(product),
    };
  },
  saveProduct: (id, body) => saveListingProduct('seller', id, body),
  createVariant: (pid, body) => createSellerVariant(pid, body),
  updateVariant: (pid, vid, body) => updateSellerVariant(pid, vid, body),
  deleteVariant: (pid, vid) => deleteSellerVariant(pid, vid),
  saveCustomizations: async (pid, rows) =>
    (await saveSellerCustomizations(pid, rows.map(toApiCustomization))).map(toEditorRow),
  searchProducts: async (query) => {
    const { products } = await getSellerProducts({ q: query, limit: 8 });
    return products.map((p) => ({ id: p.id, name: p.name, sku: p.sku }));
  },
};

/** The console's default calls, with any of them replaced. */
export function listingApi(mode: FormMode, overrides?: Partial<ListingFormApi>): ListingFormApi {
  return { ...(mode === 'admin' ? ADMIN : SELLER), ...(overrides ?? {}) };
}
