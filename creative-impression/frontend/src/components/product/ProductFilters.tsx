'use client';

import React from 'react';
import { Input } from '@/components/common';

export interface ProductFiltersProps {
  categories?: Array<{ id: string; name: string }>;
  onCategoryChange?: (categoryId: string) => void;
  onPriceChange?: (minPrice: number, maxPrice: number) => void;
  onRatingChange?: (minRating: number) => void;
  minPrice?: number;
  maxPrice?: number;
}

export const ProductFilters: React.FC<ProductFiltersProps> = ({
  categories = [],
  onCategoryChange,
  onPriceChange,
  onRatingChange,
  minPrice = 0,
  maxPrice = 50000,
}) => {
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [priceRange, setPriceRange] = React.useState({ min: minPrice, max: maxPrice });
  const [selectedRating, setSelectedRating] = React.useState<number | null>(null);

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
    onCategoryChange?.(categoryId);
  };

  const handlePriceChange = (field: 'min' | 'max', value: number) => {
    const newRange = { ...priceRange, [field]: value };
    setPriceRange(newRange);
    onPriceChange?.(newRange.min, newRange.max);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
      {/* Categories */}
      {categories.length > 0 && (
        <div>
          <h3 className="font-bold text-lg mb-4">Categories</h3>
          <div className="space-y-2">
            {categories.map((category) => (
              <label key={category.id} className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedCategory === category.id}
                  onChange={() => handleCategoryChange(category.id)}
                  className="mr-3"
                />
                <span>{category.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Price Range */}
      <div>
        <h3 className="font-bold text-lg mb-4">Price Range</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-600">Minimum Price</label>
            <Input
              type="number"
              value={priceRange.min}
              onChange={(e) => handlePriceChange('min', parseInt(e.target.value))}
              placeholder="Min price"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Maximum Price</label>
            <Input
              type="number"
              value={priceRange.max}
              onChange={(e) => handlePriceChange('max', parseInt(e.target.value))}
              placeholder="Max price"
            />
          </div>
        </div>
      </div>

      {/* Ratings */}
      <div>
        <h3 className="font-bold text-lg mb-4">Ratings</h3>
        <div className="space-y-2">
          {[5, 4, 3, 2, 1].map((rating) => (
            <label key={rating} className="flex items-center">
              <input
                type="radio"
                name="rating"
                checked={selectedRating === rating}
                onChange={() => {
                  setSelectedRating(rating);
                  onRatingChange?.(rating);
                }}
                className="mr-3"
              />
              <span>{'★'.repeat(rating)} & up</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};
