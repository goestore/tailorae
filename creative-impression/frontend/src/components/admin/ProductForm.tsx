'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  PRODUCT_STATUSES,
  createProduct,
  discontinueProduct,
  slugify,
  suggestSku,
  updateProduct,
  type AdminCategory,
  type AdminProduct,
  type ProductInput,
  type ProductStatus,
} from '@/lib/admin-products';
import { cn } from '@/utils/helpers';
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
}

const blankDraft = (categoryId: string): Draft => ({
  name: '',
  slug: '',
  sku: '',
  categoryId,
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
});

const fromProduct = (product: AdminProduct): Draft => ({
  name: product.name,
  slug: product.slug,
  sku: product.sku,
  categoryId: product.categoryId,
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
});

const FIELD = 'flex flex-col gap-1.5';

interface ProductFormProps {
  categories: AdminCategory[];
  /** Absent when adding. */
  product?: AdminProduct;
}

export const ProductForm: React.FC<ProductFormProps> = ({ categories, product }) => {
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

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const setName = (name: string) => {
    setDraft((current) => ({
      ...current,
      name,
      ...(autoDerive ? { slug: slugify(name), sku: current.sku || suggestSku(name) } : {}),
    }));
  };

  const price = Number(draft.price);
  const originalPrice = draft.originalPrice.trim() === '' ? null : Number(draft.originalPrice);

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

  const save = async () => {
    if (problems.length > 0 || busy) return;
    setBusy(true);
    setError(null);

    const input: ProductInput = {
      name: draft.name.trim(),
      slug: draft.slug.trim(),
      sku: draft.sku.trim(),
      categoryId: draft.categoryId,
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

        {problems.length > 0 && (
          <ul className="text-sm text-red-600">
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
