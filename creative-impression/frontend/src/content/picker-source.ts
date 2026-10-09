'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import type { PickerSource } from './field';

/**
 * Resolves a picker's `source` to the things it can choose from.
 *
 * The registry only records the name of a source, because what a picker can
 * choose lives outside the bundle: products are rows in Postgres. This is the
 * one place that turns a name into real options.
 */

export interface PickerOption {
  id: string;
  label: string;
  /** Optional thumbnail for the grid. */
  image?: string;
  /** A short second line — price, parent section. */
  meta?: string;
}

const currency = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

interface ApiProduct {
  id?: unknown;
  name?: unknown;
  price?: unknown;
  images?: unknown;
}

const toOption = (raw: ApiProduct): PickerOption | null => {
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const images = Array.isArray(raw.images) ? raw.images : [];
  const image = typeof images[0] === 'string' ? images[0] : undefined;
  return {
    id: raw.id,
    label: raw.name,
    image,
    meta: typeof raw.price === 'number' ? currency(raw.price) : undefined,
  };
};

/** Loads the choices for one source. Throws with a readable message. */
export async function loadPickerOptions(source: PickerSource): Promise<PickerOption[]> {
  if (source !== 'products') return [];
  try {
    // The cap matches the products API's own maximum page size. A catalog
    // bigger than this needs a search-as-you-type picker, not a longer list.
    const res = await apiClient.get('/products', { params: { limit: 50 } });
    const raw = res.data?.data?.products;
    return Array.isArray(raw)
      ? raw.map(toOption).filter((option): option is PickerOption => option !== null)
      : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load products.'));
  }
}
