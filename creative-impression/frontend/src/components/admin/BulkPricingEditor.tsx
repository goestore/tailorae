'use client';

import React, { useState } from 'react';
import { saveBulkPricing, type BulkPricingRow } from '@/lib/admin-products';
import { cn, formatCurrency } from '@/utils/helpers';
import { LABEL_VOICE } from './ContentField';

/**
 * Buy more, pay less.
 *
 * The product page renders these as a table of quantity bands, and this is
 * where they come from — the `allowBulkOrders` flag alone showed an empty one.
 *
 * Only the discount is typed. The per-unit price is worked out from it, here for
 * the preview and again on the server for the stored value, so the two figures
 * a shopper compares can never disagree.
 */

const blankTier = (previous?: BulkPricingRow): BulkPricingRow => ({
  minQty: previous?.maxQty ? previous.maxQty + 1 : 10,
  maxQty: null,
  discount: 5,
});

const FIELD = 'flex flex-col gap-1.5';

interface Props {
  productId: string;
  /** The product's own price — every tier is a discount off this. */
  price: number;
  initial: BulkPricingRow[];
}

export const BulkPricingEditor: React.FC<Props> = ({ productId, price, initial }) => {
  const [rows, setRows] = useState<BulkPricingRow[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const update = (index: number, patch: Partial<BulkPricingRow>) => {
    setSaved(false);
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const unitPrice = (discount: number) =>
    Math.round(price * (1 - (Number.isFinite(discount) ? discount : 0) / 100) * 100) / 100;

  /**
   * The same checks the API makes, run as you type. The server is still the
   * authority — this is so a mistake is visible before the save, not after it.
   */
  const problems: string[] = [];
  const sorted = [...rows].sort((a, b) => a.minQty - b.minQty);
  sorted.forEach((row, index) => {
    if (!Number.isInteger(row.minQty) || row.minQty < 2) {
      problems.push(`A band has to start at 2 or more.`);
    }
    if (row.maxQty !== null && row.maxQty < row.minQty) {
      problems.push(`The band from ${row.minQty} ends before it starts.`);
    }
    if (!(row.discount > 0 && row.discount < 100)) {
      problems.push(`The discount on the band from ${row.minQty} must be between 0 and 100.`);
    }
    if (index > 0) {
      const previous = sorted[index - 1];
      if (previous.maxQty === null || row.minQty <= previous.maxQty) {
        problems.push(
          `Bands overlap: ${row.minQty} is already covered by the one starting at ${previous.minQty}.`
        );
      }
    }
  });

  const save = async () => {
    if (problems.length > 0) return;
    setBusy(true);
    setError(null);
    try {
      setRows(await saveBulkPricing(productId, rows));
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border border-line bg-surface">
      <header className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2.5">
        <h2 className={cn(LABEL_VOICE, 'text-ink')}>Bulk pricing</h2>
        <span className={cn(LABEL_VOICE, 'text-ink-3')}>
          {rows.length === 0 ? 'None' : `${rows.length} tier${rows.length === 1 ? '' : 's'}`}
        </span>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <p className="m-0 text-[13px] text-ink-3">
          Quantity bands shown on the product page. Each is a discount off{' '}
          {formatCurrency(price)} — the per-unit price is worked out for you.
        </p>

        {rows.length > 0 && (
          <div className="flex flex-col gap-3">
            {rows.map((row, index) => (
              <div key={row.id ?? index} className="grid items-end gap-3 border border-line p-3 sm:grid-cols-4">
                <div className={FIELD}>
                  <label className={LABEL_VOICE} htmlFor={`t-min-${index}`}>
                    From
                  </label>
                  <input
                    id={`t-min-${index}`}
                    type="number"
                    min={2}
                    value={row.minQty}
                    onChange={(event) => update(index, { minQty: Number(event.target.value) })}
                    className="text-sm"
                  />
                </div>
                <div className={FIELD}>
                  <label className={LABEL_VOICE} htmlFor={`t-max-${index}`}>
                    Up to
                  </label>
                  <input
                    id={`t-max-${index}`}
                    type="number"
                    min={row.minQty}
                    value={row.maxQty ?? ''}
                    onChange={(event) =>
                      update(index, {
                        maxQty: event.target.value === '' ? null : Number(event.target.value),
                      })
                    }
                    placeholder="No limit"
                    className="text-sm"
                  />
                </div>
                <div className={FIELD}>
                  <label className={LABEL_VOICE} htmlFor={`t-disc-${index}`}>
                    Discount %
                  </label>
                  <input
                    id={`t-disc-${index}`}
                    type="number"
                    min={1}
                    max={99}
                    step={0.5}
                    value={row.discount}
                    onChange={(event) => update(index, { discount: Number(event.target.value) })}
                    className="text-sm"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 pb-2">
                  <span className="text-[13px] text-ink">
                    {formatCurrency(unitPrice(row.discount))}
                    <span className="text-ink-3"> each</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setSaved(false);
                      setRows((current) => current.filter((_, i) => i !== index));
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {problems.length > 0 && (
          <ul className="m-0 list-none space-y-1 p-0 text-[13px] text-ink-3">
            {[...new Set(problems)].map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}

        {error && (
          <p role="alert" className="alert alert-error text-sm">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSaved(false);
              setRows((current) => [...current, blankTier(current[current.length - 1])]);
            }}
          >
            Add a tier
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={save}
            disabled={busy || problems.length > 0}
          >
            {busy ? 'Saving…' : 'Save bulk pricing'}
          </button>
          {saved && <span className="text-[13px] text-ink-3">Saved.</span>}
        </div>

        <p className="m-0 text-[12px] text-ink-3">
          Removing every tier turns bulk orders off for this product. Changing the product price
          re-prices every tier on the next save.
        </p>
      </div>
    </section>
  );
};
