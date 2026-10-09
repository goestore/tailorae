'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/utils/helpers';
import { LABEL_VOICE } from './ContentField';
import { ColorSwatch } from '@/components/product/ColorSwatch';
import { ImagePicker } from './ImagePicker';
import {
  createVariant,
  deleteVariant,
  listVariants,
  suggestVariantSku,
  updateVariant,
  type AdminVariant,
} from '@/lib/admin-products';

export interface ColorManagerProps {
  productId: string;
  /** Seeds the variant SKUs, so they read as belonging to this product. */
  productSku: string;
}

interface ColorGroup {
  name: string;
  variants: AdminVariant[];
}

/** Sizes offered in the quick-add row. Anything else can still be typed. */
const COMMON_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Free Size'];

const groupByColor = (variants: AdminVariant[]): ColorGroup[] => {
  const groups = new Map<string, ColorGroup>();
  for (const variant of variants) {
    const name = (variant.color ?? '').trim() || 'Unnamed colour';
    const key = name.toLowerCase();
    const existing = groups.get(key);
    if (existing) existing.variants.push(variant);
    else groups.set(key, { name, variants: [variant] });
  }
  return [...groups.values()];
};

/**
 * Colours and their sizes, for the product editor.
 *
 * This is the data the shop grid runs on: it renders one tile per colour, so
 * until a product has colours entered here it occupies a single tile and the
 * colour filter has nothing to offer. The product page reads the same rows for
 * its size picker and its stock.
 *
 * Modelled on 9impression's ColorManager, where a colour owns its gallery and
 * its sizes. Here a colour is the set of variants sharing a colour name, so
 * there is no second table to keep in step with the first.
 */
/**
 * The size runs a garment catalogue actually uses. Offered as one click each
 * because "the usual sizes" is the answer for nearly every new colour.
 */
const SIZE_RUNS: Array<{ label: string; sizes: string[] }> = [
  { label: 'S–XXL', sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
  { label: 'XS–XXL', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  { label: 'Numeric', sizes: ['28', '30', '32', '34', '36', '38', '40'] },
];

export const ColorManager: React.FC<ColorManagerProps> = ({ productId, productSku }) => {
  const [variants, setVariants] = useState<AdminVariant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newColor, setNewColor] = useState('');
  const [sizeDraft, setSizeDraft] = useState<Record<string, string>>({});

  // Nothing is set synchronously: the effect below only starts the fetch, and
  // every setState lands in a callback once it resolves.
  const load = useCallback(
    () =>
      listVariants(productId)
        .then((rows) => {
          setVariants(rows);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    [productId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => groupByColor(variants), [variants]);

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      load();
    } catch (err) {
      setError((err as Error).message);
      setBusyId(null);
    }
  };

  /** A colour exists once it has at least one size, so this adds both. */
  const addColor = (event: React.FormEvent) => {
    event.preventDefault();
    const color = newColor.trim();
    if (!color) return;
    void run('new-color', async () => {
      await createVariant(productId, {
        color,
        size: 'M',
        sku: suggestVariantSku(productSku, color, 'M'),
        quantity: 0,
      });
      setNewColor('');
    });
  };

  const addSize = (color: string) => {
    const size = (sizeDraft[color] ?? '').trim();
    if (!size) return;
    void run(`size-${color}`, async () => {
      await createVariant(productId, {
        color,
        size,
        sku: suggestVariantSku(productSku, color, size),
        quantity: 0,
      });
      setSizeDraft((current) => ({ ...current, [color]: '' }));
    });
  };

  /**
   * Add a whole size run at once.
   *
   * The single-size field below is right for filling a gap; it is the wrong
   * tool for a new colour, where the answer is almost always the same five
   * sizes. Doing that one at a time is five round trips and five chances to
   * mistype, per colour, per product.
   *
   * Sizes already present are skipped rather than refused, so running this on a
   * colour that has S and M adds the rest instead of erroring on a duplicate.
   */
  const addSizeRun = (color: string, sizes: string[]) => {
    const present = new Set(
      groups
        .find((group) => group.name === color)
        ?.variants.map((variant) => (variant.size ?? '').trim().toUpperCase()) ?? []
    );
    const missing = sizes.filter((size) => !present.has(size.toUpperCase()));
    if (missing.length === 0) return;

    void run(`run-${color}`, async () => {
      // In series, not in parallel: each one needs its own unique SKU, and a
      // burst of concurrent inserts is how two of them end up with the same.
      for (const size of missing) {
        await createVariant(productId, {
          color,
          size,
          sku: suggestVariantSku(productSku, color, size),
          quantity: 0,
        });
      }
    });
  };

  const setStock = (variant: AdminVariant, quantity: number) =>
    run(variant.id, () => updateVariant(productId, variant.id, { quantity }));

  /**
   * Images belong to the colour, not to one size, so a change writes to every
   * size of that colour. Otherwise the grid tile would show whichever size
   * happened to be created first.
   */
  const setColorImage = (group: ColorGroup, image: string) =>
    run(`image-${group.name}`, async () => {
      for (const variant of group.variants) {
        await updateVariant(productId, variant.id, { images: image ? [image] : [] });
      }
    });

  const remove = (variant: AdminVariant) =>
    run(variant.id, () => deleteVariant(productId, variant.id));

  return (
    // Framed like every other section of the product page. `admin-panel` was
    // the previous console's card and left this one sitting unbordered between
    // two that were framed.
    <section className="border border-line bg-surface">
      <header className="border-b border-line bg-surface-2 px-4 py-2.5">
        <h2 className={cn(LABEL_VOICE, 'text-ink')}>Colours &amp; sizes</h2>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <p className="m-0 text-[13px] text-ink-3">
          The shop shows one tile per colour, so a polo in three colours takes three
          places in the grid. Sizes and stock live under each colour.
        </p>

      {error && <p className="alert alert-error text-sm">{error}</p>}

      {isLoading ? (
        <p className="text-sm text-ink-3">Loading colours…</p>
      ) : (
        <>
          {groups.length === 0 && (
            <p className="border border-line bg-surface-2 p-4 text-sm text-ink-3">
              No colours yet. This product shows as a single tile, and it will not appear
              under any colour filter.
            </p>
          )}

          <div className="flex flex-col gap-4">
            {groups.map((group) => {
              const image = group.variants.find((variant) => variant.images?.[0])?.images[0] ?? '';
              const stock = group.variants.reduce((sum, variant) => sum + variant.quantity, 0);

              return (
                <article key={group.name} className="border border-line p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="m-0 flex items-center gap-2 text-sm font-semibold text-ink">
                      <ColorSwatch color={{ name: group.name }} size={14} />
                      {group.name}
                    </h3>
                    <span className="text-xs text-ink-3">
                      {group.variants.length} {group.variants.length === 1 ? 'size' : 'sizes'} ·{' '}
                      {stock} in stock
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                    <div>
                      <label
                        htmlFor={`color-image-${group.name}`}
                        className="mb-1.5 block text-xs font-medium text-ink-2"
                      >
                        Photograph for this colour
                      </label>
                      <ImagePicker
                        id={`color-image-${group.name}`}
                        value={image}
                        invalid={false}
                        onChange={(value) => void setColorImage(group, value)}
                        onBlur={() => {}}
                      />
                    </div>

                    <div>
                      <p className="mb-1.5 text-xs font-medium text-ink-2">Sizes and stock</p>
                      <ul className="m-0 flex list-none flex-col gap-2 p-0">
                        {group.variants.map((variant) => (
                          <li key={variant.id} className="flex flex-wrap items-center gap-2">
                            <span className="min-w-[4.5rem] text-sm text-ink">
                              {variant.size || '—'}
                            </span>
                            <label className="sr-only" htmlFor={`stock-${variant.id}`}>
                              Stock for {variant.name}
                            </label>
                            <input
                              id={`stock-${variant.id}`}
                              type="number"
                              min={0}
                              defaultValue={variant.quantity}
                              disabled={busyId === variant.id}
                              onBlur={(event) => {
                                const next = Math.max(0, Number(event.target.value) || 0);
                                if (next !== variant.quantity) void setStock(variant, next);
                              }}
                              className="h-8 w-24 text-sm"
                            />
                            <code className="text-xs text-ink-3">{variant.sku}</code>
                            <button
                              type="button"
                              onClick={() => void remove(variant)}
                              disabled={busyId === variant.id}
                              className="ml-auto text-xs text-red-600 underline disabled:opacity-40"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor={`add-size-${group.name}`}>
                          Add a size to {group.name}
                        </label>
                        <input
                          id={`add-size-${group.name}`}
                          list="common-sizes"
                          value={sizeDraft[group.name] ?? ''}
                          onChange={(event) =>
                            setSizeDraft((current) => ({
                              ...current,
                              [group.name]: event.target.value,
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              addSize(group.name);
                            }
                          }}
                          placeholder="Add a size"
                          className="h-8 w-32 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => addSize(group.name)}
                          disabled={busyId === `size-${group.name}`}
                          className="btn btn-outline btn-sm"
                        >
                          Add size
                        </button>

                        {SIZE_RUNS.map((sizeRun) => (
                          <button
                            key={sizeRun.label}
                            type="button"
                            onClick={() => addSizeRun(group.name, sizeRun.sizes)}
                            disabled={busyId === `run-${group.name}`}
                            title={`Add ${sizeRun.sizes.join(', ')}`}
                            className="btn btn-ghost btn-sm"
                          >
                            {busyId === `run-${group.name}` ? 'Adding…' : `+ ${sizeRun.label}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <form onSubmit={addColor} className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
            <div>
              <label htmlFor="new-color" className="mb-1.5 block text-xs font-medium text-ink-2">
                Add a colour
              </label>
              <input
                id="new-color"
                value={newColor}
                onChange={(event) => setNewColor(event.target.value)}
                placeholder="e.g. Navy Blue"
                className="h-9 w-48 text-sm"
              />
            </div>
            <button type="submit" disabled={busyId === 'new-color'} className="btn btn-primary btn-sm">
              {busyId === 'new-color' ? 'Adding…' : 'Add colour'}
            </button>
            <p className="m-0 text-xs text-ink-3">
              Starts with size M at zero stock; add the rest underneath.
            </p>
          </form>

          <datalist id="common-sizes">
            {COMMON_SIZES.map((size) => (
              <option key={size} value={size} />
            ))}
          </datalist>
        </>
      )}
      </div>
    </section>
  );
};
