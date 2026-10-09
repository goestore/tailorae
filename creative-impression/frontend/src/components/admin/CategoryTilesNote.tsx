import React from 'react';
import Link from 'next/link';

/**
 * Shown in the home page's "Categories" content section. The heading is
 * edited here; the tiles themselves are categories marked "Show on homepage",
 * with their image and order, in Admin › Categories.
 */
export const CategoryTilesNote: React.FC = () => (
  <p className="ce-help" style={{ margin: '0 0 12px' }}>
    The tiles are managed in{' '}
    <Link href="/admin/categories" style={{ textDecoration: 'underline' }}>
      Categories
    </Link>
    : open a category and use its Homepage section to show it, set its image and its order.
  </p>
);
