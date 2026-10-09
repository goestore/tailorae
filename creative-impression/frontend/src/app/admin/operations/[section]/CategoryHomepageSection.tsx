'use client';

import React from 'react';
import { ImagePicker } from '@/components/admin/ImagePicker';

/**
 * The category's homepage tile: its image, whether it appears in the home
 * page's "Explore all categories" band, and where. Any category at any depth
 * can be a tile; it links to the category's own page.
 *
 * The image is the same one the category page uses — upload one, pick from
 * the media library, or type a path.
 */
export interface CategoryHomepageValue {
  image: string;
  showOnHome: boolean;
  homeOrder: string;
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: 'var(--admin-text-2)',
  fontSize: 13,
  letterSpacing: '-0.005em',
};

const hintStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 4,
  color: 'var(--admin-text-3, var(--admin-text-2))',
  fontSize: 12,
};

export const CategoryHomepageSection: React.FC<{
  value: CategoryHomepageValue;
  onChange: (patch: Partial<CategoryHomepageValue>) => void;
}> = ({ value, onChange }) => {
  const orderInvalid = value.homeOrder.trim() !== '' && !Number.isInteger(Number(value.homeOrder));
  return (
    <fieldset
      style={{
        margin: '0 0 12px',
        padding: '12px 14px',
        border: '1px solid var(--admin-border, rgba(127,127,127,0.25))',
        borderRadius: 10,
      }}
    >
      <legend style={{ ...labelStyle, marginBottom: 0, padding: '0 6px', fontWeight: 600 }}>Homepage</legend>

      <div style={{ marginBottom: 12 }}>
        <span style={labelStyle} id="category-image-label">
          Image
        </span>
        <ImagePicker
          id="category-image"
          value={value.image}
          invalid={false}
          describedBy="category-image-label"
          onChange={(image) => onChange({ image })}
          onBlur={() => undefined}
        />
        <span style={hintStyle}>Square works best. Without one, the tile shows a placeholder.</span>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--admin-text-2)', fontSize: 12.5 }}
        >
          <input
            type="checkbox"
            checked={value.showOnHome}
            onChange={(event) => onChange({ showOnHome: event.target.checked })}
          />
          Show on homepage (&ldquo;Explore all categories&rdquo;)
        </label>
        <label style={{ flex: '0 1 160px' }}>
          <span style={labelStyle}>Homepage order</span>
          <input
            type="number"
            step={1}
            value={value.homeOrder}
            disabled={!value.showOnHome}
            aria-invalid={orderInvalid || undefined}
            onChange={(event) => onChange({ homeOrder: event.target.value })}
            style={{ width: '100%' }}
          />
        </label>
      </div>
      <span style={hintStyle}>
        Lower comes first. The Custom Wear tile sits at 10.
      </span>
    </fieldset>
  );
};
