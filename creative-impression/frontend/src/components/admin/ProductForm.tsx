'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  PRODUCT_STATUSES,
  createProduct,
  discontinueProduct,
  listBrands,
  listSellerOptions,
  slugify,
  suggestSku,
  updateProduct,
  type AdminBrand,
  type AdminCategory,
  type AdminProduct,
  type ProductInput,
  type ProductStatus,
  type SellerOption,
} from '@/lib/admin-products';
import { cn, formatCurrency } from '@/utils/helpers';
import { ImagePicker } from './ImagePicker';
import { LABEL_VOICE } from './ContentField';

/**
 * Add or edit one product.
 *
 * The same form does both, because "create" and "edit" differ only in where the
 * initial values come from and which endpoint the save calls. Two forms would
 * be two places for a field to be forgotten.
 *
 * Slug and SKU are generated from the name and stay editable. The API requires
 * both, but neither is a decision worth making by hand, and a form that demands
 * them turns "add a product" into a chore that gets avoided.
 */

interface Draft {
  name: string;
  slug: string;
  sku: string;
  categoryId: string;
  brandId: string;
  price: string;
  originalPrice: string;
  quantity: string;
  status: ProductStatus;
  shortDescription: string;
  description: string;
  color: string;
  material: string;
  images: string[];
  isFeatured: boolean;
  isCustomizable: boolean;
  allowBulkOrders: boolean;
  vendorId: string;
  costPrice: string;
  sizeGuide: string;
  videoUrl: string;
  barcode: string;
  weight: string;
  dimensions: string;
  minOrderQuantity: string;
  maxOrderQuantity: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
}

const blankDraft = (categoryId: string): Draft => ({
  name: '',
  slug: '',
  sku: '',
  categoryId,
  brandId: '',
  price: '',
  originalPrice: '',
  quantity: '0',
  // New products start hidden. Publishing is a separate, deliberate act, so a
  // half-filled product cannot appear in the shop while it is being written.
  status: 'DRAFT',
  shortDescription: '',
  description: '',
  color: '',
  material: '',
  images: [],
  isFeatured: false,
  isCustomizable: false,
  allowBulkOrders: false,
  // Empty is house stock — the shop's own listing, owing no commission.
  vendorId: '',
  costPrice: '',
  sizeGuide: '',
  videoUrl: '',
  barcode: '',
  weight: '',
  dimensions: '',
  minOrderQuantity: '1',
  maxOrderQuantity: '',
  metaTitle: '',
  metaDescription: '',
  metaKeywords: '',
});

const fromProduct = (product: AdminProduct): Draft => ({
  name: product.name,
  slug: product.slug,
  sku: product.sku,
  categoryId: product.categoryId,
  brandId: product.brandId ?? '',
  price: String(product.price ?? ''),
  originalPrice: product.originalPrice === null ? '' : String(product.originalPrice),
  quantity: String(product.quantity ?? 0),
  status: product.status,
  shortDescription: product.shortDescription ?? '',
  description: product.description ?? '',
  color: product.color ?? '',
  material: product.material ?? '',
  images: Array.isArray(product.images) ? product.images : [],
  isFeatured: product.isFeatured,
  isCustomizable: product.isCustomizable,
  allowBulkOrders: product.allowBulkOrders,
  vendorId: product.vendorId ?? '',
  costPrice: product.costPrice === null ? '' : String(product.costPrice),
  sizeGuide: product.sizeGuide ?? '',
  videoUrl: product.videoUrl ?? '',
  barcode: product.barcode ?? '',
  weight: product.weight === null ? '' : String(product.weight),
  dimensions: product.dimensions ?? '',
  minOrderQuantity: String(product.minOrderQuantity ?? 1),
  maxOrderQuantity: product.maxOrderQuantity === null ? '' : String(product.maxOrderQuantity),
  metaTitle: product.metaTitle ?? '',
  metaDescription: product.metaDescription ?? '',
  metaKeywords: product.metaKeywords ?? '',
});

const FIELD = 'flex flex-col gap-1.5';

interface ProductFormProps {
  categories: AdminCategory[];
  /** Absent when adding. */
  product?: AdminProduct;
}

export const ProductForm: React.FC<ProductFormProps> = ({ categories, product }) => {
  // Fetched here rather than threaded through both call sites: the list is
  // small, admin-only, and a failure degrades to "No brand".
  const [brands, setBrands] = useState<AdminBrand[]>([]);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  useEffect(() => {
    listBrands().then(setBrands).catch(() => {});
    listSellerOptions().then(setSellers).catch(() => {});
  }, []);

  const router = useRouter();
  const editing = product !== undefined;

  const [draft, setDraft] = useState<Draft>(() =>
    product ? fromProduct(product) : blankDraft(categories[0]?.id ?? '')
  );
  // Once the name has been typed over, generated values stop following it —
  // otherwise editing a live product's name would silently change its URL.
  const [autoDerive, setAutoDerive] = useState(!editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemoval, setConfirmingDelete] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setHasInteracted(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const setName = (name: string) => {
    setHasInteracted(true);
    setDraft((current) => ({
      ...current,
      name,
      ...(autoDerive ? { slug: slugify(name), sku: current.sku || suggestSku(name) } : {}),
    }));
  };

  const price = Number(draft.price);
  const originalPrice = draft.originalPrice.trim() === '' ? null : Number(draft.originalPrice);
  const costPrice = draft.costPrice.trim() === '' ? null : Number(draft.costPrice);
  const minOrderQuantity = Number(draft.minOrderQuantity) || 1;
  const maxOrderQuantity =
    draft.maxOrderQuantity.trim() === '' ? null : Number(draft.maxOrderQuantity);

  /**
   * The discount badge on the product page, worked out rather than typed.
   * Storing it lets the catalogue sort and filter by it without recomputing per
   * row; deriving it here means it can never contradict the two prices above it.
   */
  const discountPercentage =
    originalPrice !== null && originalPrice > price
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : 0;

  /** What is left after cost. Shown, never stored — margin is a fact about the two prices. */
  const margin = costPrice !== null && costPrice > 0 && price > 0 ? price - costPrice : null;

  /** Everything that must be true before the API will accept this. */
  const problems: string[] = [];
  if (draft.name.trim() === '') problems.push('Name is required.');
  if (draft.slug.trim() === '') problems.push('Slug is required.');
  if (draft.sku.trim() === '') problems.push('SKU is required.');
  if (draft.categoryId === '') problems.push('Choose a category.');
  if (!Number.isFinite(price) || price <= 0) problems.push('Price must be more than zero.');
  if (originalPrice !== null && (!Number.isFinite(originalPrice) || originalPrice < price)) {
    problems.push('The "was" price must be higher than the price, or empty.');
  }
  // Publishing has a higher bar than saving: a live product with no picture is
  // a hole in the shop.
  if (draft.status === 'ACTIVE' && draft.images.length === 0) {
    problems.push('Add at least one image before setting the product live.');
  }
  if (costPrice !== null && (!Number.isFinite(costPrice) || costPrice < 0)) {
    problems.push('Cost price must be a number, or empty.');
  }
  if (maxOrderQuantity !== null && maxOrderQuantity < minOrderQuantity) {
    problems.push('The most someone may buy cannot be less than the least.');
  }

  const save = async () => {
    if (problems.length > 0 || busy) return;
    setBusy(true);
    setError(null);

    const input: ProductInput = {
      name: draft.name.trim(),
      slug: draft.slug.trim(),
      sku: draft.sku.trim(),
      categoryId: draft.categoryId,
      // Empty string means "no brand" and the API turns it back into null.
      brandId: draft.brandId,
      price,
      originalPrice,
      quantity: Number(draft.quantity) || 0,
      status: draft.status,
      shortDescription: draft.shortDescription,
      description: draft.description,
      images: draft.images.filter((image) => image.trim() !== ''),
      color: draft.color,
      material: draft.material,
      isFeatured: draft.isFeatured,
      isCustomizable: draft.isCustomizable,
      allowBulkOrders: draft.allowBulkOrders,
      // Empty string is house stock, and the API maps it to null.
      vendorId: draft.vendorId,
      costPrice,
      discountPercentage,
      sizeGuide: draft.sizeGuide,
      videoUrl: draft.videoUrl,
      barcode: draft.barcode,
      weight: draft.weight.trim() === '' ? null : Number(draft.weight),
      dimensions: draft.dimensions,
      minOrderQuantity,
      maxOrderQuantity,
      metaTitle: draft.metaTitle,
      metaDescription: draft.metaDescription,
      metaKeywords: draft.metaKeywords,
    };

    try {
      if (editing) await updateProduct(product.id, input);
      else await createProduct(input);

      router.push('/admin/products');
      // The listing is a client fetch, so it has to be told the catalog moved.
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || busy) return;
    setBusy(true);
    setError(null);
    try {
      await discontinueProduct(product.id);
      router.push('/admin/products');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="alert alert-error text-sm">
          {error}
        </p>
      )}

      {categories.length === 0 && (
        <p className="alert alert-error text-sm">
          There are no categories yet, and a product needs one.{' '}
          <Link href="/admin/products" className="underline">
            Add a category first.
          </Link>
        </p>
      )}

      <section className="border border-line bg-surface">
        <header className="border-b border-line bg-surface-2 px-4 py-2.5">
          <h2 className={cn(LABEL_VOICE, 'text-ink')}>Basics</h2>
        </header>

        <div className="flex flex-col gap-4 p-4">
          <div className={FIELD}>
            <label htmlFor="p-name" className={LABEL_VOICE}>
              Name
            </label>
            <input
              id="p-name"
              type="text"
              value={draft.name}
              className="text-sm"
              placeholder="Classic Cotton Polo"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className={FIELD}>
              <label htmlFor="p-price" className={LABEL_VOICE}>
                Price (₹)
              </label>
              <input
                id="p-price"
                type="number"
                min="0"
                step="1"
                value={draft.price}
                className="text-sm"
                onChange={(event) => set('price', event.target.value)}
              />
            </div>

            <div className={FIELD}>
              <label htmlFor="p-was" className={LABEL_VOICE}>
                Was (₹)
              </label>
              <input
                id="p-was"
                type="number"
                min="0"
                step="1"
                value={draft.originalPrice}
                className="text-sm"
                placeholder="Optional"
                onChange={(event) => set('originalPrice', event.target.value)}
              />
              <p className="form-help">
                Shows as a struck-through price with the discount worked out. Leave empty for no
                sale badge.
              </p>
            </div>

            <div className={FIELD}>
              <label htmlFor="p-cost" className={LABEL_VOICE}>
                Cost to us (₹)
              </label>
              <input
                id="p-cost"
                type="number"
                min="0"
                step="0.01"
                value={draft.costPrice}
                className="text-sm"
                placeholder="Optional"
                onChange={(event) => set('costPrice', event.target.value)}
              />
              <p className="form-help">
                {margin === null
                  ? 'Never shown to shoppers. Used to work out margin.'
                  : `Margin ${formatCurrency(margin)} · ${Math.round((margin / price) * 100)}% of the sale price.`}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className={FIELD}>
              <label htmlFor="p-category" className={LABEL_VOICE}>
                Category
              </label>
              <select
                id="p-category"
                value={draft.categoryId}
                className="text-sm"
                onChange={(event) => set('categoryId', event.target.value)}
              >
                {categories.length === 0 && <option value="">No categories</option>}
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={FIELD}>
              <label htmlFor="p-brand" className={LABEL_VOICE}>
                Brand
              </label>
              <select
                id="p-brand"
                value={draft.brandId}
                className="text-sm"
                onChange={(event) => set('brandId', event.target.value)}
              >
                {/* Optional on purpose: an own-label product carries no third
                    party brand, and forcing one would invent data. */}
                <option value="">No brand</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={FIELD}>
              <label htmlFor="p-seller" className={LABEL_VOICE}>
                Sold by
              </label>
              <select
                id="p-seller"
                value={draft.vendorId}
                className="text-sm"
                onChange={(event) => set('vendorId', event.target.value)}
              >
                {/* House stock owes no commission and appears under no shop. */}
                <option value="">Us — house stock</option>
                {sellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.shopName}
                    {seller.isVerified ? '' : ' — awaiting approval'}
                    {seller.isActive ? '' : ' — suspended'}
                  </option>
                ))}
              </select>
            </div>

            <div className={FIELD}>
              <label htmlFor="p-stock" className={LABEL_VOICE}>
                Stock
              </label>
              <input
                id="p-stock"
                type="number"
                min="0"
                step="1"
                value={draft.quantity}
                className="text-sm"
                onChange={(event) => set('quantity', event.target.value)}
              />
            </div>
          </div>

          {draft.vendorId !== '' && (
            <p className="form-help">
              This listing belongs to a seller: it appears on their shop page, and each order splits
              their share out and pays them for it, less commission.
            </p>
          )}

          <div className={FIELD}>
            <label htmlFor="p-short" className={LABEL_VOICE}>
              Short description
            </label>
            <input
              id="p-short"
              type="text"
              value={draft.shortDescription}
              className="text-sm"
              placeholder="One line, shown on cards and in search results"
              onChange={(event) => set('shortDescription', event.target.value)}
            />
          </div>

          <div className={FIELD}>
            <label htmlFor="p-desc" className={LABEL_VOICE}>
              Description
            </label>
            <textarea
              id="p-desc"
              rows={4}
              value={draft.description}
              className="text-sm"
              onChange={(event) => set('description', event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="border border-line bg-surface">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
          <h2 className={cn(LABEL_VOICE, 'text-ink')}>Images</h2>
          <span className={LABEL_VOICE}>
            {draft.images.length === 0 ? 'None yet' : `${draft.images.length} · first is the main one`}
          </span>
        </header>

        <div className="flex flex-col gap-4 p-4">
          {draft.images.map((image, index) => (
            <div key={index} className="flex flex-col gap-2 border border-line bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className={LABEL_VOICE}>
                  {index === 0 ? 'Main image' : `Image ${index + 1}`}
                </span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline px-2"
                    disabled={index === 0}
                    aria-label={`Move image ${index + 1} up`}
                    onClick={() =>
                      set(
                        'images',
                        draft.images.map((entry, position) =>
                          position === index - 1
                            ? draft.images[index]
                            : position === index
                              ? draft.images[index - 1]
                              : entry
                        )
                      )
                    }
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost px-2"
                    aria-label={`Remove image ${index + 1}`}
                    onClick={() =>
                      set(
                        'images',
                        draft.images.filter((_, position) => position !== index)
                      )
                    }
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </span>
              </div>

              <ImagePicker
                id={`p-image-${index}`}
                value={image}
                invalid={false}
                onChange={(next) =>
                  set(
                    'images',
                    draft.images.map((entry, position) => (position === index ? next : entry))
                  )
                }
                onBlur={() => undefined}
              />
            </div>
          ))}

          <div>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => set('images', [...draft.images, ''])}
            >
              Add image
            </button>
          </div>
        </div>
      </section>

      <section className="border border-line bg-surface">
        <header className="border-b border-line bg-surface-2 px-4 py-2.5">
          <h2 className={cn(LABEL_VOICE, 'text-ink')}>Details &amp; visibility</h2>
        </header>

        <div className="flex flex-col gap-4 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className={FIELD}>
              <label htmlFor="p-color" className={LABEL_VOICE}>
                Colour
              </label>
              <input
                id="p-color"
                type="text"
                value={draft.color}
                className="text-sm"
                placeholder="Navy"
                onChange={(event) => set('color', event.target.value)}
              />
            </div>

            <div className={FIELD}>
              <label htmlFor="p-material" className={LABEL_VOICE}>
                Material
              </label>
              <input
                id="p-material"
                type="text"
                value={draft.material}
                className="text-sm"
                placeholder="100% cotton piqué"
                onChange={(event) => set('material', event.target.value)}
              />
            </div>
          </div>

          <div className={FIELD}>
            <label htmlFor="p-status" className={LABEL_VOICE}>
              Status
            </label>
            <select
              id="p-status"
              value={draft.status}
              className="max-w-[16rem] text-sm"
              onChange={(event) => set('status', event.target.value as ProductStatus)}
            >
              {PRODUCT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <p className="form-help">
              Only ACTIVE products appear in the shop. DRAFT keeps it hidden while you work on it.
            </p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className={cn(LABEL_VOICE, 'mb-1')}>Flags</legend>
            {(
              [
                ['isFeatured', 'Featured — eligible for the home page’s featured row'],
                ['isCustomizable', 'Customizable — can be personalised'],
                ['allowBulkOrders', 'Bulk orders — available to B2B customers'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-ink-2">
                <input
                  type="checkbox"
                  checked={draft[key]}
                  className="h-4 w-4 accent-[var(--brand)]"
                  onChange={(event) => set(key, event.target.checked)}
                />
                {label}
              </label>
            ))}
          </fieldset>
        </div>
      </section>

      <section className="border border-line bg-surface">
        <header className="border-b border-line bg-surface-2 px-4 py-2.5">
          <h2 className={cn(LABEL_VOICE, 'text-ink')}>Sizing &amp; shipping</h2>
        </header>

        <div className="flex flex-col gap-4 p-4">
          <div className={FIELD}>
            <label htmlFor="p-sizeguide" className={LABEL_VOICE}>
              Size guide
            </label>
            <textarea
              id="p-sizeguide"
              rows={5}
              value={draft.sizeGuide}
              className="text-sm"
              placeholder={'S \u2014 chest 38in, length 27in\nM \u2014 chest 40in, length 28in'}
              onChange={(event) => set('sizeGuide', event.target.value)}
            />
            <p className="form-help">
              Opens from the size guide link on the product page. Leave it empty and the shopper
              gets the generic chart for the category instead.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className={FIELD}>
              <label htmlFor="p-weight" className={LABEL_VOICE}>
                Weight (kg)
              </label>
              <input
                id="p-weight"
                type="number"
                min="0"
                step="0.01"
                value={draft.weight}
                className="text-sm"
                placeholder="0.25"
                onChange={(event) => set('weight', event.target.value)}
              />
              <p className="form-help">Used to work out shipping.</p>
            </div>

            <div className={FIELD}>
              <label htmlFor="p-dimensions" className={LABEL_VOICE}>
                Dimensions
              </label>
              <input
                id="p-dimensions"
                type="text"
                value={draft.dimensions}
                className="text-sm"
                placeholder="30 x 24 x 4 cm"
                onChange={(event) => set('dimensions', event.target.value)}
              />
            </div>

            <div className={FIELD}>
              <label htmlFor="p-minqty" className={LABEL_VOICE}>
                Least someone may buy
              </label>
              <input
                id="p-minqty"
                type="number"
                min="1"
                step="1"
                value={draft.minOrderQuantity}
                className="text-sm"
                onChange={(event) => set('minOrderQuantity', event.target.value)}
              />
              <p className="form-help">The quantity the product page opens on.</p>
            </div>

            <div className={FIELD}>
              <label htmlFor="p-maxqty" className={LABEL_VOICE}>
                Most someone may buy
              </label>
              <input
                id="p-maxqty"
                type="number"
                min="1"
                step="1"
                value={draft.maxOrderQuantity}
                className="text-sm"
                placeholder="No limit"
                onChange={(event) => set('maxOrderQuantity', event.target.value)}
              />
            </div>

            <div className={FIELD}>
              <label htmlFor="p-barcode" className={LABEL_VOICE}>
                Barcode
              </label>
              <input
                id="p-barcode"
                type="text"
                value={draft.barcode}
                spellCheck={false}
                className="font-mono text-sm"
                placeholder="EAN or UPC"
                onChange={(event) => set('barcode', event.target.value)}
              />
            </div>

            <div className={FIELD}>
              <label htmlFor="p-video" className={LABEL_VOICE}>
                Video URL
              </label>
              <input
                id="p-video"
                type="url"
                value={draft.videoUrl}
                spellCheck={false}
                className="text-sm"
                placeholder="https://..."
                onChange={(event) => set('videoUrl', event.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="border border-line bg-surface">
        <header className="border-b border-line bg-surface-2 px-4 py-2.5">
          <h2 className={cn(LABEL_VOICE, 'text-ink')}>Search &amp; sharing</h2>
        </header>

        <div className="flex flex-col gap-4 p-4">
          <p className="m-0 text-[13px] text-ink-3">
            What Google and a shared link show. Leave these empty and the product&rsquo;s own name
            and short description are used.
          </p>

          <div className={FIELD}>
            <label htmlFor="p-metatitle" className={LABEL_VOICE}>
              Title
            </label>
            <input
              id="p-metatitle"
              type="text"
              value={draft.metaTitle}
              className="text-sm"
              placeholder={draft.name || 'Product name'}
              onChange={(event) => set('metaTitle', event.target.value)}
            />
            <p className="form-help">
              {(draft.metaTitle || draft.name).length} characters &mdash; Google shows about 60.
            </p>
          </div>

          <div className={FIELD}>
            <label htmlFor="p-metadesc" className={LABEL_VOICE}>
              Description
            </label>
            <textarea
              id="p-metadesc"
              rows={3}
              value={draft.metaDescription}
              className="text-sm"
              placeholder={draft.shortDescription || 'One or two lines about the product'}
              onChange={(event) => set('metaDescription', event.target.value)}
            />
            <p className="form-help">
              {(draft.metaDescription || draft.shortDescription).length} characters &mdash; Google
              shows about 155.
            </p>
          </div>

          <div className={FIELD}>
            <label htmlFor="p-metakeywords" className={LABEL_VOICE}>
              Keywords
            </label>
            <input
              id="p-metakeywords"
              type="text"
              value={draft.metaKeywords}
              className="text-sm"
              placeholder="polo shirt, cotton polo, corporate uniform"
              onChange={(event) => set('metaKeywords', event.target.value)}
            />
            <p className="form-help">
              Comma separated. Search engines largely ignore these; the site&rsquo;s own search uses
              them.
            </p>
          </div>

          {/* What the fields above actually produce, laid out the way a search
              result is. Cheaper to read than a character count alone. */}
          <div className="border border-line p-3">
            <p className={cn(LABEL_VOICE, 'm-0 mb-2 text-ink-3')}>Preview</p>
            <p className="m-0 truncate text-[15px] text-ink">
              {draft.metaTitle || draft.name || 'Product name'}
            </p>
            <p className="m-0 mt-0.5 text-[12px] text-ink-3">
              /products/{draft.slug || 'product-slug'}
            </p>
            <p className="m-0 mt-1 text-[13px] text-ink-2">
              {draft.metaDescription ||
                draft.shortDescription ||
                'No description yet \u2014 add a short description or a meta description.'}
            </p>
          </div>
        </div>
      </section>

      <section className="border border-line bg-surface">
        <header className="border-b border-line bg-surface-2 px-4 py-2.5">
          <h2 className={cn(LABEL_VOICE, 'text-ink')}>Web address</h2>
        </header>

        <div className="grid gap-4 p-4 md:grid-cols-2">
          <div className={FIELD}>
            <label htmlFor="p-slug" className={LABEL_VOICE}>
              Slug
            </label>
            <input
              id="p-slug"
              type="text"
              value={draft.slug}
              spellCheck={false}
              className="font-mono text-sm"
              onChange={(event) => {
                setAutoDerive(false);
                set('slug', slugify(event.target.value));
              }}
            />
            <p className="form-help">Generated from the name. Changing it changes the product’s URL.</p>
          </div>

          <div className={FIELD}>
            <label htmlFor="p-sku" className={LABEL_VOICE}>
              SKU
            </label>
            <input
              id="p-sku"
              type="text"
              value={draft.sku}
              spellCheck={false}
              className="font-mono text-sm"
              onChange={(event) => {
                setAutoDerive(false);
                set('sku', event.target.value.toUpperCase());
              }}
            />
            <p className="form-help">Must be unique across the catalog.</p>
          </div>
        </div>
      </section>

      <div className="sticky bottom-3 z-30 flex flex-col gap-3 border border-line bg-surface p-3 shadow-2">
        {confirmingRemoval && (
          <div className="border border-line-strong bg-surface-2 p-3">
            <p className="text-sm font-semibold text-ink">Discontinue “{draft.name}”?</p>
            <p className="form-help mt-0.5">
              It stops appearing in the shop and its status becomes DISCONTINUED. It stays in the
              catalog and in past orders, and you can set it back to ACTIVE at any time.
            </p>
          </div>
        )}

        {hasInteracted && problems.length > 0 && (
          <ul className="text-sm text-red-600" aria-live="polite">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin/products" className="btn btn-sm btn-ghost">
            Back to products
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {editing && !confirmingRemoval && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={busy}
                onClick={() => setConfirmingDelete(true)}
              >
                Discontinue
              </button>
            )}
            {confirmingRemoval && (
              <>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Keep
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  {busy ? 'Working…' : 'Discontinue'}
                </button>
              </>
            )}

            {!confirmingRemoval && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={busy || problems.length > 0}
                onClick={() => void save()}
              >
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Add product'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
