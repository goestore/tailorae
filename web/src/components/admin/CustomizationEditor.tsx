'use client';

import React, { useState } from 'react';
import {
  parseCustomizationOptions,
  saveCustomizations,
  type ProductCustomizationRow,
} from '@/lib/admin-products';
import { cn } from '@/utils/helpers';
import { LABEL_VOICE } from './ContentField';

/**
 * What a shopper can personalise on this product.
 *
 * The product page already renders these — a name to embroider, a print
 * position to pick — and adds each option's cost to the price as it is chosen.
 * Until now only the `isCustomizable` flag was editable, so ticking it opened a
 * section on the storefront with nothing in it.
 *
 * Saved as a whole list on its own endpoint rather than with the product: the
 * rows belong to a product that must already exist, and replacing the set is
 * the only way to express a reorder or a removal in one request.
 */

const TYPES: Array<{ value: ProductCustomizationRow['type']; label: string; hint: string }> = [
  { value: 'text', label: 'Text', hint: 'They type something — a name, a number' },
  { value: 'color', label: 'Choice', hint: 'They pick from the options you list' },
  { value: 'embroidery', label: 'Embroidery', hint: 'Stitched text, usually charged extra' },
  { value: 'image', label: 'Upload', hint: 'They send a file — a logo, artwork' },
];

const blankRow = (): ProductCustomizationRow => ({
  name: '',
  type: 'text',
  isRequired: false,
  options: [],
  additionalCost: 0,
  maxCharacters: null,
});

const FIELD = 'flex flex-col gap-1.5';

interface Props {
  productId: string;
  initial: ProductCustomizationRow[];
  /** Which console is editing; a seller saves through the shop's route. */
  as?: 'admin' | 'seller';
}

export const CustomizationEditor: React.FC<Props> = ({ productId, initial, as = 'admin' }) => {
  const [rows, setRows] = useState<ProductCustomizationRow[]>(() =>
    initial.map((row) => ({ ...row, options: parseCustomizationOptions(row.options) }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const update = (index: number, patch: Partial<ProductCustomizationRow>) => {
    setSaved(false);
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await saveCustomizations(productId, rows, as);
      setRows(next.map((row) => ({ ...row, options: parseCustomizationOptions(row.options) })));
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
        <h2 className={cn(LABEL_VOICE, 'text-ink')}>Personalisation</h2>
        <span className={cn(LABEL_VOICE, 'text-ink-3')}>
          {rows.length === 0 ? 'None' : `${rows.length} option${rows.length === 1 ? '' : 's'}`}
        </span>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <p className="m-0 text-[13px] text-ink-3">
          Shown on the product page as fields the shopper fills in before adding to the basket. Any
          extra cost is added to the price as they choose.
        </p>

        {rows.map((row, index) => {
          const options = parseCustomizationOptions(row.options);
          return (
            <div key={index} className="flex flex-col gap-3 border border-line p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className={FIELD}>
                  <label className={LABEL_VOICE} htmlFor={`c-name-${index}`}>
                    What are they choosing?
                  </label>
                  <input
                    id={`c-name-${index}`}
                    value={row.name}
                    onChange={(event) => update(index, { name: event.target.value })}
                    placeholder="Name to embroider"
                    className="text-sm"
                  />
                </div>
                <div className={FIELD}>
                  <label className={LABEL_VOICE} htmlFor={`c-type-${index}`}>
                    How
                  </label>
                  <select
                    id={`c-type-${index}`}
                    value={row.type}
                    onChange={(event) =>
                      update(index, { type: event.target.value as ProductCustomizationRow['type'] })
                    }
                    className="text-sm"
                  >
                    {TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <p className="m-0 text-[12px] text-ink-3">
                    {TYPES.find((type) => type.value === row.type)?.hint}
                  </p>
                </div>
              </div>

              {/* Options are not exclusive to the "choice" type: a text field
                  can offer suggestions too, and the catalogue already has rows
                  shaped that way. Only an upload has nothing to list. */}
              {row.type !== 'image' && (
                <div className={FIELD}>
                  <label className={LABEL_VOICE} htmlFor={`c-options-${index}`}>
                    Options, one per line
                  </label>
                  <textarea
                    id={`c-options-${index}`}
                    rows={3}
                    value={options.join('\n')}
                    onChange={(event) =>
                      update(index, {
                        options: event.target.value.split('\n').map((option) => option.trim()),
                      })
                    }
                    placeholder={'Left chest\nBack\nSleeve'}
                    className="text-sm"
                  />
                  <p className="m-0 text-[12px] text-ink-3">
                    {row.type === 'color'
                      ? 'They pick one of these.'
                      : 'Optional. Leave empty for a free-text field.'}
                  </p>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <div className={FIELD}>
                  <label className={LABEL_VOICE} htmlFor={`c-cost-${index}`}>
                    Extra cost (₹)
                  </label>
                  <input
                    id={`c-cost-${index}`}
                    type="number"
                    min={0}
                    step={1}
                    value={row.additionalCost}
                    onChange={(event) =>
                      update(index, { additionalCost: Number(event.target.value) || 0 })
                    }
                    className="text-sm"
                  />
                </div>
                {(row.type === 'text' || row.type === 'embroidery') && (
                  <div className={FIELD}>
                    <label className={LABEL_VOICE} htmlFor={`c-max-${index}`}>
                      Character limit
                    </label>
                    <input
                      id={`c-max-${index}`}
                      type="number"
                      min={1}
                      value={row.maxCharacters ?? ''}
                      onChange={(event) =>
                        update(index, {
                          maxCharacters:
                            event.target.value === '' ? null : Number(event.target.value),
                        })
                      }
                      placeholder="No limit"
                      className="text-sm"
                    />
                  </div>
                )}
                <label className="flex items-end gap-2 pb-2 text-sm text-ink-2">
                  <input
                    type="checkbox"
                    checked={row.isRequired}
                    onChange={(event) => update(index, { isRequired: event.target.checked })}
                  />
                  Required
                </label>
              </div>

              <div>
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
          );
        })}

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
              setRows((current) => [...current, blankRow()]);
            }}
          >
            Add an option
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save personalisation'}
          </button>
          {saved && <span className="text-[13px] text-ink-3">Saved.</span>}
        </div>

        <p className="m-0 text-[12px] text-ink-3">
          Removing every option turns personalisation off for this product.
        </p>
      </div>
    </section>
  );
};
