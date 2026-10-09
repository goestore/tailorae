'use client';

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Input } from '@/components/common';
import {
  sellerSlugify,
  suggestSellerSku,
  type SellerCategory,
  type SellerProductInput,
} from '@/lib/seller-api';
import type { ProductStatus } from '@/types';
import { PhotoField } from './PhotoField';
import { Select, TextArea } from './fields';

/**
 * The one product form, shared by listing something new and editing it later.
 *
 * Numbers are held as strings while they are being typed: a half-typed price is
 * not a number, and coercing on every keystroke is what makes a field refuse to
 * let you clear it. They become numbers once, on submit.
 *
 * What a seller is *not* offered is as deliberate as what they are. There is no
 * featured flag, no shop picker and no commission — those belong to the
 * platform, and a control that cannot be honoured is worse than no control.
 */

export interface ProductFormValues {
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
  sizeGuide: string;
  images: string[];
}

export const EMPTY_PRODUCT: ProductFormValues = {
  name: '',
  slug: '',
  sku: '',
  categoryId: '',
  price: '',
  originalPrice: '',
  quantity: '0',
  status: 'DRAFT',
  shortDescription: '',
  description: '',
  color: '',
  material: '',
  sizeGuide: '',
  images: [],
};

/** What a seller may set a listing to. Discontinuing is its own action. */
const STATUS_OPTIONS: Array<{ value: ProductStatus; label: string; note: string }> = [
  { value: 'DRAFT', label: 'Draft', note: 'Only you can see it' },
  { value: 'ACTIVE', label: 'Live', note: 'On sale in the shop' },
  { value: 'INACTIVE', label: 'Hidden', note: 'Kept, but off the shop for now' },
];

export interface ProductFormProps {
  categories: SellerCategory[];
  initial: ProductFormValues;
  submitLabel: string;
  onSubmit: (input: SellerProductInput) => Promise<void>;
  /** Rendered beside the submit button — a cancel link, a discontinue action. */
  children?: React.ReactNode;
}

export const ProductForm: React.FC<ProductFormProps> = ({
  categories,
  initial,
  submitLabel,
  onSubmit,
  children,
}) => {
  const [values, setValues] = useState<ProductFormValues>(initial);
  const [isSaving, setIsSaving] = useState(false);

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  /**
   * The web address follows the name until someone edits it by hand.
   *
   * Slug and SKU are both required by the API and neither is a decision a
   * seller should be asked to make. The slug tracks the name only while it
   * still matches what the name would have produced — otherwise a deliberate
   * address would be overwritten by the next keystroke in the name field. The
   * SKU is left blank and invented on save, because its random tail is what
   * stops two sellers listing a "Blue Polo" from colliding.
   */
  const setName = (name: string) => {
    setValues((current) => {
      const next = { ...current, name };
      if (current.slug === sellerSlugify(current.name)) next.slug = sellerSlugify(name);
      return next;
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const name = values.name.trim();
    const price = Number(values.price);
    if (!name) {
      toast.error('Give the product a name.');
      return;
    }
    if (!values.categoryId) {
      toast.error('Choose a category.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Set a price.');
      return;
    }

    const originalPrice = values.originalPrice.trim() === '' ? null : Number(values.originalPrice);
    if (originalPrice !== null && (!Number.isFinite(originalPrice) || originalPrice < price)) {
      toast.error('The was-price has to be higher than the price you are selling at.');
      return;
    }

    const quantity = values.quantity.trim() === '' ? 0 : Number(values.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      toast.error('Stock has to be a whole number.');
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit({
        name,
        slug: sellerSlugify(values.slug) || sellerSlugify(name),
        sku: values.sku.trim().toUpperCase() || suggestSellerSku(name),
        categoryId: values.categoryId,
        price,
        originalPrice,
        quantity,
        status: values.status,
        shortDescription: values.shortDescription.trim(),
        description: values.description.trim(),
        color: values.color.trim(),
        material: values.material.trim(),
        sizeGuide: values.sizeGuide.trim(),
        images: values.images,
        // The first photo is the thumbnail; see PhotoField for why there is no
        // separate field for it.
        thumbnail: values.images[0] ?? '',
      });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-8 flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2
          className="m-0 text-ink"
          style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}
        >
          The basics
        </h2>

        <Input
          id="product-name"
          label="Name *"
          value={values.name}
          onChange={(event) => setName(event.target.value)}
          placeholder="What is it called?"
          maxLength={200}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id="product-category"
            label="Category *"
            value={values.categoryId}
            onChange={(event) => set('categoryId', event.target.value)}
            helperText={
              categories.length === 0
                ? 'No categories are open for listing yet — please ask us to add one.'
                : undefined
            }
          >
            <option value="">Choose one</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>

          <Select
            id="product-status"
            label="Visibility"
            value={values.status}
            onChange={(event) => set('status', event.target.value as ProductStatus)}
            helperText={
              STATUS_OPTIONS.find((option) => option.value === values.status)?.note ??
              'Not on sale'
            }
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {/* Only shown when the listing is already in this state, so the
                select never lies about what it is displaying. */}
            {values.status === 'DISCONTINUED' && <option value="DISCONTINUED">Discontinued</option>}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            id="product-price"
            label="Price *"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={values.price}
            onChange={(event) => set('price', event.target.value)}
            placeholder="0"
            helperText="In rupees"
          />
          <Input
            id="product-original-price"
            label="Was"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={values.originalPrice}
            onChange={(event) => set('originalPrice', event.target.value)}
            placeholder="Optional"
            helperText="Shows as a strike-through"
          />
          <Input
            id="product-quantity"
            label="Stock"
            type="number"
            min={0}
            step="1"
            inputMode="numeric"
            value={values.quantity}
            onChange={(event) => set('quantity', event.target.value)}
            helperText="Across all sizes"
          />
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-line pt-8">
        <h2
          className="m-0 text-ink"
          style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}
        >
          How it looks
        </h2>

        <PhotoField
          value={values.images}
          onChange={(images) => set('images', images)}
          disabled={isSaving}
        />

        <TextArea
          id="product-short-description"
          label="One-line summary"
          rows={2}
          maxLength={300}
          value={values.shortDescription}
          onChange={(event) => set('shortDescription', event.target.value)}
          placeholder="The line that sits under the name on the product page."
        />

        <TextArea
          id="product-description"
          label="Description"
          rows={6}
          maxLength={5000}
          value={values.description}
          onChange={(event) => set('description', event.target.value)}
          placeholder="Fabric, fit, care — everything a shopper would otherwise have to ask you."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="product-color"
            label="Colour"
            value={values.color}
            onChange={(event) => set('color', event.target.value)}
            placeholder="Ivory"
            helperText="The main colour. Add the rest as sizes once it is saved."
          />
          <Input
            id="product-material"
            label="Material"
            value={values.material}
            onChange={(event) => set('material', event.target.value)}
            placeholder="100% cotton"
          />
        </div>

        <TextArea
          id="product-size-guide"
          label="Size guide"
          rows={3}
          maxLength={2000}
          value={values.sizeGuide}
          onChange={(event) => set('sizeGuide', event.target.value)}
          placeholder="Measurements, or how it runs against a usual size."
        />
      </section>

      <details className="border-t border-line pt-8">
        <summary className="cursor-pointer text-[14px] font-semibold text-ink">
          Address and stock code
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            id="product-slug"
            label="Web address"
            value={values.slug}
            onChange={(event) => set('slug', event.target.value)}
            placeholder="Filled in from the name"
            helperText="The end of the product page URL."
          />
          <Input
            id="product-sku"
            label="SKU"
            value={values.sku}
            onChange={(event) => set('sku', event.target.value)}
            placeholder="Made up for you on save"
            helperText="Your own stock code. It has to be unique across the whole shop."
          />
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <Button type="submit" size="lg" loading={isSaving}>
          {submitLabel}
        </Button>
        {children}
      </div>
    </form>
  );
};
