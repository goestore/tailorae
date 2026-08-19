'use client';

import React, { useEffect, useState } from 'react';
import { Button, Input } from '@/components/common';
import { CATALOG_CATEGORIES, CatalogCategory } from '@/lib/catalog';

export interface ProductFilterValues {
  category?: string;
  minPrice?: string;
  maxPrice?: string;
  sortBy?: string;
}

export interface ProductFiltersProps {
  categories?: CatalogCategory[];
  /** Current values (typically derived from the URL). */
  values: ProductFilterValues;
  /** Called with the changed fields; the page merges these into the URL. */
  onChange: (changed: ProductFilterValues) => void;
}

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Top Rated' },
];

export const ProductFilters: React.FC<ProductFiltersProps> = ({
  categories = CATALOG_CATEGORIES,
  values,
  onChange,
}) => {
  const [minPrice, setMinPrice] = useState(values.minPrice ?? '');
  const [maxPrice, setMaxPrice] = useState(values.maxPrice ?? '');

  // Keep local price inputs in sync when the URL changes externally.
  useEffect(() => {
    setMinPrice(values.minPrice ?? '');
    setMaxPrice(values.maxPrice ?? '');
  }, [values.minPrice, values.maxPrice]);

  const applyPrice = (e: React.FormEvent) => {
    e.preventDefault();
    onChange({ minPrice: minPrice.trim(), maxPrice: maxPrice.trim() });
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
      {/* Sort */}
      <div>
        <h3 className="font-bold text-lg mb-4">Sort By</h3>
        <select
          value={values.sortBy ?? 'newest'}
          onChange={(e) => onChange({ sortBy: e.target.value })}
          aria-label="Sort products"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Categories */}
      <div>
        <h3 className="font-bold text-lg mb-4">Categories</h3>
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          <label className="flex items-center cursor-pointer">
            <input
              type="radio"
              name="category"
              checked={!values.category}
              onChange={() => onChange({ category: '' })}
              className="mr-3"
            />
            <span>All Products</span>
          </label>
          {categories.map((category) => (
            <label key={category.slug} className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="category"
                checked={values.category === category.slug}
                onChange={() => onChange({ category: category.slug })}
                className="mr-3"
              />
              <span>{category.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Price Range */}
      <form onSubmit={applyPrice}>
        <h3 className="font-bold text-lg mb-4">Price Range</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-600" htmlFor="filter-min-price">
              Minimum Price
            </label>
            <Input
              id="filter-min-price"
              type="number"
              min={0}
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="Min price"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600" htmlFor="filter-max-price">
              Maximum Price
            </label>
            <Input
              id="filter-max-price"
              type="number"
              min={0}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Max price"
            />
          </div>
          <Button type="submit" variant="outline" size="sm" fullWidth className="border border-neutral-300">
            Apply Price
          </Button>
        </div>
      </form>

      <button
        type="button"
        onClick={() => onChange({ category: '', minPrice: '', maxPrice: '', sortBy: '' })}
        className="text-sm font-medium text-primary-700 hover:underline"
      >
        Clear all filters
      </button>
    </div>
  );
};
