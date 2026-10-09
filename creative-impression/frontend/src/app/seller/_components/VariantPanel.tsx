'use client';

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Input } from '@/components/common';
import {
  createSellerVariant,
  deleteSellerVariant,
  suggestSellerVariantSku,
  updateSellerVariant,
  type SellerVariant,
} from '@/lib/seller-api';
import { formatCurrency } from '@/utils/helpers';

/**
 * The colours and sizes of one listing.
 *
 * A variant is one size of one colour; the shop grid renders a card per
 * distinct colour and the product page groups the sizes under it. The admin
 * console's variant routes are admin-only, so these go through the
 * seller-scoped ones, which resolve the product against the caller's own shop
 * before touching anything.
 *
 * Stock and price are edited in place rather than behind a modal: restocking
 * is the thing a seller does most often, and it should not cost a page.
 */

export interface VariantPanelProps {
  productId: string;
  productSku: string;
  productPrice: number;
  variants: SellerVariant[];
  /** Re-read the listing after a change, so the panel and the API agree. */
  onChanged: () => void;
}

interface Draft {
  price: string;
  quantity: string;
}

const draftOf = (variant: SellerVariant): Draft => ({
  price: variant.price === null ? '' : String(variant.price),
  quantity: String(variant.quantity),
});

export const VariantPanel: React.FC<VariantPanelProps> = ({
  productId,
  productSku,
  productPrice,
  variants,
  onChanged,
}) => {
  /**
   * Only the rows that have been touched are held here; everything else is
   * read straight off the variant. Seeding this from props would mean copying
   * server state into an effect and then having to keep the two in step.
   */
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newColor, setNewColor] = useState('');
  const [newSize, setNewSize] = useState('');
  const [newQuantity, setNewQuantity] = useState('0');
  const [isAdding, setIsAdding] = useState(false);

  const draftFor = (variant: SellerVariant): Draft => drafts[variant.id] ?? draftOf(variant);

  const editDraft = (variant: SellerVariant, patch: Partial<Draft>) =>
    setDrafts((current) => ({
      ...current,
      [variant.id]: { ...(current[variant.id] ?? draftOf(variant)), ...patch },
    }));

  const isDirty = (variant: SellerVariant): boolean => {
    const draft = drafts[variant.id];
    if (!draft) return false;
    const original = draftOf(variant);
    return draft.price !== original.price || draft.quantity !== original.quantity;
  };

  const save = async (variant: SellerVariant) => {
    const draft = draftFor(variant);
    const quantity = Number(draft.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      toast.error('Stock has to be a whole number.');
      return;
    }
    const price = draft.price.trim() === '' ? null : Number(draft.price);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      toast.error('A price cannot be negative.');
      return;
    }

    setBusyId(variant.id);
    try {
      await updateSellerVariant(productId, variant.id, { quantity, price });
      setDrafts((current) => {
        const next = { ...current };
        delete next[variant.id];
        return next;
      });
      toast.success('Size updated.');
      onChanged();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (variant: SellerVariant) => {
    setBusyId(variant.id);
    try {
      await deleteSellerVariant(productId, variant.id);
      toast.success('Size removed.');
      onChanged();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const color = newColor.trim();
    const size = newSize.trim();
    if (!color && !size) {
      toast.error('Give the size a colour, a size, or both.');
      return;
    }
    const quantity = newQuantity.trim() === '' ? 0 : Number(newQuantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      toast.error('Stock has to be a whole number.');
      return;
    }

    setIsAdding(true);
    try {
      await createSellerVariant(productId, {
        sku: suggestSellerVariantSku(productSku, color, size),
        color: color || null,
        size: size || null,
        quantity,
        // Null means it costs what the listing costs; a size that carries a
        // surcharge gets its own figure once it is in the table.
        price: null,
      });
      setNewSize('');
      setNewQuantity('0');
      toast.success('Size added.');
      onChanged();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2
        className="m-0 text-ink"
        style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}
      >
        Colours &amp; sizes
      </h2>
      <p className="mt-2 max-w-[62ch] text-[14px]" style={{ color: 'var(--ink-3)' }}>
        Optional. Add one row per size of each colour and shoppers pick from them; leave it empty
        and the listing sells as a single item at {formatCurrency(productPrice)}. Leave a price
        blank for any size that costs the same as the listing.
      </p>

      {variants.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-strong)' }}>
                {['Colour', 'Size', 'SKU', 'Price', 'Stock', ''].map((head) => (
                  <th
                    key={head}
                    scope="col"
                    className="py-3 pr-4 text-[10.5px] font-bold uppercase tracking-[0.1em]"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {variants.map((variant) => {
                const draft = draftFor(variant);
                const dirty = isDirty(variant);

                return (
                  <tr key={variant.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="py-3 pr-4 text-[13.5px] text-ink">{variant.color ?? '—'}</td>
                    <td className="py-3 pr-4 text-[13.5px] text-ink">{variant.size ?? '—'}</td>
                    <td
                      className="py-3 pr-4 font-mono text-[12px]"
                      style={{ color: 'var(--ink-3)' }}
                    >
                      {variant.sku}
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        aria-label={`Price for ${variant.name}`}
                        value={draft.price}
                        placeholder="Same"
                        onChange={(event) => editDraft(variant, { price: event.target.value })}
                        className="w-[92px] rounded-lg border border-neutral-300 bg-white px-2 py-1 text-[13.5px] text-black focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        type="number"
                        min={0}
                        step="1"
                        inputMode="numeric"
                        aria-label={`Stock for ${variant.name}`}
                        value={draft.quantity}
                        onChange={(event) => editDraft(variant, { quantity: event.target.value })}
                        className="w-[80px] rounded-lg border border-neutral-300 bg-white px-2 py-1 text-[13.5px] text-black focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-3 text-[13px]">
                        {dirty ? (
                          <button
                            type="button"
                            onClick={() => save(variant)}
                            disabled={busyId === variant.id}
                            className="font-semibold underline underline-offset-2 text-ink disabled:opacity-40"
                          >
                            Save
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => remove(variant)}
                            disabled={busyId === variant.id}
                            className="underline underline-offset-2 disabled:opacity-40"
                            style={{ color: 'var(--sale)' }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={add} className="mt-6 flex flex-wrap items-end gap-3">
        <div className="w-[160px]">
          <Input
            id="variant-color"
            label="Colour"
            value={newColor}
            onChange={(event) => setNewColor(event.target.value)}
            placeholder="Ivory"
            maxLength={60}
          />
        </div>
        <div className="w-[120px]">
          <Input
            id="variant-size"
            label="Size"
            value={newSize}
            onChange={(event) => setNewSize(event.target.value)}
            placeholder="M"
            maxLength={60}
          />
        </div>
        <div className="w-[110px]">
          <Input
            id="variant-quantity"
            label="Stock"
            type="number"
            min={0}
            step="1"
            inputMode="numeric"
            value={newQuantity}
            onChange={(event) => setNewQuantity(event.target.value)}
          />
        </div>
        <Button type="submit" variant="outline" loading={isAdding}>
          Add size
        </Button>
      </form>
      <p className="mt-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>
        The colour stays put after each add, so a full size run is a few taps.
      </p>
    </section>
  );
};
