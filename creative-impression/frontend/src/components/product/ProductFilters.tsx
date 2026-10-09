'use client';

import { parseColourParam, type ColourFacet } from '@/lib/products-api';
import React from 'react';
import { CATALOG_CATEGORIES, CatalogCategory } from '@/lib/catalog';
import type { Brand } from '@/types';
import type { Facets } from '@/lib/products-api';
import { ColorSwatch } from './ColorSwatch';

export interface ProductFilterValues {
  category?: string;
  minPrice?: string;
  maxPrice?: string;
  sortBy?: string;
  /** Free-text search within the current listing. */
  q?: string;
  /** Colour facet, matched against the product's variants by name. */
  color?: string;
  /** Brand facet, by slug. */
  brand?: string;
  /** '1' when on. */
  inStock?: string;
  onSale?: string;
  /** Size facet, as sold. */
  size?: string;
  /** "Ideal for" facet — a Myntra age group such as Kids-Girls. */
  ageGroup?: string;
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
  /** Colour facets from the API. The group is hidden when there are none. */
  colors?: ColourFacet[];
  /** Brand facets from the API. Hidden until brands exist in the catalogue. */
  brands?: Brand[];
  /** Size and age-group facets for the current category. */
  facets?: Facets;
}

/**
 * Sort keys match 9impression's, so a sorted URL means the same thing on
 * either store. The backend still accepts this project's original spellings,
 * which is what keeps existing links working.
 */
export const SORT_OPTIONS = [
  { value: 'popular', label: 'Most Popular' },
  { value: 'new', label: 'Newest' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
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
  colors = [],
  brands = [],
  facets = { sizes: [], ageGroups: [] },
}) => {
  // Sizes in chart order, grouped the way the listing form groups them.
  const sizeGroups = facets.sizes.reduce<Array<{ group: string; sizes: string[] }>>((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && last.group === s.group) last.sizes.push(s.value);
    else acc.push({ group: s.group, sizes: [s.value] });
    return acc;
  }, []);
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

      {brands.length > 0 && (
        <Group title="Brand">
          <Check
            type="radio"
            name="brand"
            checked={!values.brand}
            onChange={() => onChange({ brand: '' })}
            label="All brands"
          />
          {brands.map((brand) => (
            <Check
              key={brand.id}
              type="radio"
              name="brand"
              checked={values.brand === brand.slug}
              onChange={() => onChange({ brand: brand.slug })}
              label={
                brand._count ? `${brand.name} (${brand._count.products})` : brand.name
              }
            />
          ))}
        </Group>
      )}

      {facets.ageGroups.length > 1 && (
        <Group title="Ideal for">
          <Check
            type="radio"
            name="ageGroup"
            checked={!values.ageGroup}
            onChange={() => onChange({ ageGroup: '' })}
            label="Everyone"
          />
          {facets.ageGroups.map((age) => (
            <Check
              key={age.value}
              type="radio"
              name="ageGroup"
              checked={values.ageGroup === age.value}
              onChange={() => onChange({ ageGroup: age.value })}
              label={age.label}
            />
          ))}
        </Group>
      )}

      {/* A template's filterable attributes (upper material for footwear,
          connectivity for electronics) and the category's own filterable
          fields (screen size), written to the URL as attr_<key>. */}
      {(facets.attributes ?? []).map((facet) => {
        const param = `attr_${facet.key}`;
        return (
          <Group key={facet.key} title={facet.label}>
            <Check
              type="radio"
              name={param}
              checked={!values[param]}
              onChange={() => onChange({ [param]: '' })}
              label="Any"
            />
            {facet.values.map((value) => (
              <Check
                key={value}
                type="radio"
                name={param}
                checked={values[param] === value}
                onChange={() => onChange({ [param]: value })}
                label={facet.unit ? `${value} ${facet.unit}` : value}
              />
            ))}
          </Group>
        );
      })}

      {sizeGroups.length > 0 && (
        <Group title={facets.optionLabel ?? 'Size'}>
          <div className="flex flex-col gap-2.5">
            {sizeGroups.map(({ group, sizes }) => (
              <div key={group}>
                {sizeGroups.length > 1 && (
                  <p className="mb-1.5 text-[11px] text-ink-3">{group}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {sizes.map((size) => {
                    const active = values.size === size;
                    return (
                      <button
                        key={size}
                        type="button"
                        onClick={() => onChange({ size: active ? '' : size })}
                        aria-pressed={active}
                        className={`min-w-[2.5rem] border px-2 py-1 text-[12px] transition-colors ${
                          active
                            ? 'border-[var(--brand)] bg-[var(--brand)] font-semibold text-ink'
                            : 'border-line text-ink-2 hover:border-ink hover:text-ink'
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Group>
      )}

      {/* Colour families from the API: one fixed list, so "navy", "Navy Blue"
          and "Nevy blue" are one chip. Only families some product carries are
          offered, each with its count; several can be picked at once. */}
      {colors.length > 0 && (
        <Group title="Colour">
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {colors.map((family) => {
              const picked = parseColourParam(values.color);
              const active = picked.includes(family.slug);
              const next = active ? picked.filter((s) => s !== family.slug) : [...picked, family.slug];
              const isMulti = family.slug === 'multi';
              return (
                <button
                  key={family.slug}
                  type="button"
                  onClick={() => onChange({ color: next.join(',') })}
                  aria-pressed={active}
                  title={`${family.name} (${family.count})`}
                  className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[12px] transition-colors ${
                    active
                      ? 'border-ink text-ink'
                      : 'border-line text-ink-2 hover:border-ink hover:text-ink'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-[11px] w-[11px] shrink-0 rounded-full"
                    style={{
                      background: isMulti
                        ? 'conic-gradient(#C62828, #E9B600, #2E7D4F, #2F5DA8, #6A3D9A, #C62828)'
                        : family.hex,
                      border: '1px solid var(--border-strong)',
                    }}
                  />
                  <span className="max-w-[11ch] truncate">{family.name}</span>
                  <span style={{ color: 'var(--ink-3)' }}>{family.count}</span>
                </button>
              );
            })}
          </div>
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
