import { canonicalFamily, suggestFamily } from '@/utils/colour-families';

/**
 * Fills in `colorFamily` on a product or variant write, in place.
 *
 * - A family the caller sent is normalised to the list's spelling ("navy blue"
 *   → "Navy Blue"); one that is not on the list is replaced by a suggestion.
 * - A write that changes the colour but sends no family gets one suggested
 *   from the colour name (and, for a product, its prominent colour first).
 *
 * Kept free of the Prisma client so it can be tested on plain objects.
 */
type Data = Record<string, unknown>;

const str = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { set?: unknown }).set === 'string') {
    return (value as { set: string }).set;
  }
  return null;
};

function variantData(data: Data): void {
  const sent = str(data.colorFamily);
  if (sent !== null) {
    data.colorFamily = canonicalFamily(sent)?.name ?? suggestFamily(str(data.color))?.name ?? null;
    return;
  }
  if ('color' in data) {
    const colour = str(data.color);
    data.colorFamily = colour ? (suggestFamily(colour)?.name ?? null) : null;
  }
}

function productData(data: Data): void {
  const sent = str(data.colorFamily);
  if (sent !== null) {
    data.colorFamily = canonicalFamily(sent)?.name ?? null;
    return;
  }
  if (!('primaryColour' in data) && !('brandColour' in data) && !('color' in data)) return;
  const prominent = str(data.primaryColour);
  const named = str(data.brandColour) || str(data.color);
  const family = canonicalFamily(prominent) ?? suggestFamily(named);
  // A partial update that only touched one of these leaves an existing family
  // alone unless it can say something better.
  if (family) data.colorFamily = family.name;
  else if (prominent !== null || named !== null) data.colorFamily = null;
}

export function colourFamilyWrite(model: string | undefined, action: string, args: unknown): void {
  if (model !== 'ProductVariant' && model !== 'Product') return;
  if (!args || typeof args !== 'object') return;
  const apply = model === 'ProductVariant' ? variantData : productData;
  const a = args as { data?: unknown; create?: unknown; update?: unknown };

  const each = (value: unknown) => {
    if (Array.isArray(value)) value.forEach((v) => v && typeof v === 'object' && apply(v as Data));
    else if (value && typeof value === 'object') apply(value as Data);
  };

  if (['create', 'update', 'updateMany', 'createMany'].includes(action)) each(a.data);
  if (action === 'upsert') {
    each(a.create);
    each(a.update);
  }
}
