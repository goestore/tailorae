'use client';

import React from 'react';
import { CATALOG_CATEGORIES, CatalogCategory } from '@/lib/catalog';

export interface ProductFilterValues {
  category?: string;
  minPrice?: string;
  maxPrice?: string;
  sortBy?: string;
  /** Free-text search within the current listing. */
  q?: string;
  /** '1' when on. */
  inStock?: string;
  onSale?: string;
  /** These map straight onto URL query parameters, hence the open shape. */
  [key: string]: string | undefined;
}

export interface ProductFiltersProps {
  categories?: CatalogCategory[];
  values: ProductFilterValues;
  /** Called with only the changed fields; the listing merges them into the URL. */
  onChange: (changed: ProductFilterValues) => void;
  /**
   * Hidden when the page is already scoped to one category — a section page
   * cannot offer to filter to a different section.
   */
  showCategories?: boolean;
}

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Top Rated' },
];

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="border-t border-line py-4 first:border-t-0 first:pt-0">
    <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
      {title}
    </h3>
    {children}
  </div>
);

const Check: React.FC<{
  type: 'radio' | 'checkbox';
  name?: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}> = ({ type, name, checked, onChange, label }) => (
  <label className="flex cursor-pointer items-center gap-2.5 py-1 text-[13px] text-ink-2 transition-colors hover:text-ink">
    <input
      type={type}
      name={name}
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 flex-shrink-0 accent-[var(--brand)]"
    />
    {label}
  </label>
);
/**
 * Price bands rather than a min/max pair with an apply button: two inputs and a
 * button cannot line up in a 200px rail (inputs are 38px tall, btn-sm is 30px),
 * and a band is one click instead of type-type-submit. They still write the same
 * minPrice/maxPrice parameters, so a hand-typed range in the URL keeps working.
 */
const PRICE_BANDS = [
  { label: 'All prices', min: '', max: '' },
  { label: 'Under ₹500', min: '', max: '499' },
  { label: '₹500 – ₹999', min: '500', max: '999' },
  { label: '₹1,000 – ₹1,999', min: '1000', max: '1999' },
  { label: '₹2,000 and above', min: '2000', max: '' },
];

export const ProductFilters: React.FC<ProductFiltersProps> = ({
  categories = CATALOG_CATEGORIES,
  values,
  onChange,
  showCategories = true,
}) => {
  return (
    <div className="text-ink">
      {showCategories && (
        <Group title="Category">
          <Check
            type="radio"
            name="category"
            checked={!values.category}
            onChange={() => onChange({ category: '' })}
            label="All products"
          />
          {categories.map((category) => (
            <Check
              key={category.slug}
              type="radio"
              name="category"
              checked={values.category === category.slug}
              onChange={() => onChange({ category: category.slug })}
              label={category.name}
            />
          ))}
        </Group>
      )}

      <Group title="Price">
        {PRICE_BANDS.map((band) => (
          <Check
            key={band.label}
            type="radio"
            name="price"
            checked={(values.minPrice ?? '') === band.min && (values.maxPrice ?? '') === band.max}
            onChange={() => onChange({ minPrice: band.min, maxPrice: band.max })}
            label={band.label}
          />
        ))}
      </Group>

      <Group title="Availability">
        <Check
          type="checkbox"
          checked={values.inStock === '1'}
          onChange={() => onChange({ inStock: values.inStock === '1' ? '' : '1' })}
          label="In stock only"
        />
        <Check
          type="checkbox"
          checked={values.onSale === '1'}
          onChange={() => onChange({ onSale: values.onSale === '1' ? '' : '1' })}
          label="On sale"
        />
      </Group>
    </div>
  );
};
