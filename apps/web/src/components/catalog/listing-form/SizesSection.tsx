'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { getColourFamilies } from '@/lib/products-api';
import type { ArticleSpec } from '@/lib/catalogue-api';
import { ChipInput, RequiredMark, SelectField, TextField } from './controls';
import { productColumn } from './BusinessSection';
import { SwatchPicker } from './SwatchPicker';
import {
  SIZE_PICKER_ID,
  fieldId,
  isApparel,
  measureId,
  optionNoun,
  rowFieldId,
  sizeGroups,
  swatchColours,
  type ListingDraft,
  type VariantRow,
  type YesNo,
} from './model';

interface SizesSectionProps {
  draft: ListingDraft;
  spec: ArticleSpec;
  missing: Set<string>;
  onSizes: (sizes: string[]) => void;
  onColours: (colours: string[]) => void;
  onRow: (index: number, patch: Partial<VariantRow>) => void;
  onRemoveRow: (index: number) => void;
  onMeasure: (size: string, key: string, value: string) => void;
  update: (patch: Partial<ListingDraft>) => void;
  /** Set one colour's family against the latest draft (suggestions are async). */
  onColourFamily: (colour: string, family: string | null, onlyIfEmpty?: boolean) => void;
}

const BASIS_LABELS: Record<string, string> = {
  'Garment Measurements in': 'Garment measurements',
  'To-Fit Denotes Body Measurements in': 'To-fit (body) measurements',
};

/** Colours, sizes, one row per colour × size, and the measurement chart. */
export const SizesSection: React.FC<SizesSectionProps> = ({
  draft,
  spec,
  missing,
  onSizes,
  onColours,
  onRow,
  onRemoveRow,
  onMeasure,
  update,
  onColourFamily,
}) => {
  const [query, setQuery] = useState('');
  // The fixed colour-family list, read once.
  const [colourFamilies, setColourFamilies] = useState<Array<{ name: string; hex: string }>>([]);
  useEffect(() => {
    getColourFamilies()
      .then(setColourFamilies)
      .catch(() => undefined);
  }, []);
  const [bulkStock, setBulkStock] = useState('');
  const groups = useMemo(() => sizeGroups(spec.sizes), [spec.sizes]);
  const variantCol = (field: string) =>
    spec.columns.find((c) => c.scope === 'variant' && c.field === field);
  const measures = useMemo(() => {
    const cols = spec.columns.filter((c) => c.scope === 'measurement');
    return [...cols.filter((c) => c.required), ...cols.filter((c) => !c.required)];
  }, [spec.columns]);
  const basis = productColumn(spec, 'measurementBasis');

  const q = query.trim().toLowerCase();
  const matches = q ? spec.sizes.filter((s) => s.toLowerCase().includes(q)) : spec.sizes;
  const toggle = (size: string) =>
    onSizes(
      draft.sizes.includes(size) ? draft.sizes.filter((s) => s !== size) : [...draft.sizes, size]
    );

  const req = (field: string) => Boolean(variantCol(field)?.required);
  const cellInvalid = (id: string) => (missing.has(id) ? true : undefined);
  // Clothing rows carry a standard size and a size-on-label flag; a pair of
  // shoes or a phone is just its option value ("UK 7", "128 GB").
  const apparel = isApparel(spec);
  const noun = optionNoun(spec);
  const optionLabel = apparel ? 'Size' : spec.optionLabel;

  return (
    <>
      <ChipInput
        id={fieldId('colours')}
        label="Colours"
        noun="colour"
        values={draft.colours}
        onChange={onColours}
        max={12}
        placeholder="e.g. Dusty Rose"
        hint={
          !apparel
            ? `One row per colour and ${noun} is created below.`
            : draft.colours.filter(Boolean).length > 1
              ? 'Several colours in one listing share one article number, brand colour and set of photos, and cannot be exported to Myntra. For a marketplace listing, save this colour, then use “Add another colour”.'
              : 'One row per colour and size is created below. For the same design in another colour, save this one and use “Add another colour” instead.'
        }
        extra={
          draft.brandColour.trim() && !draft.colours.includes(draft.brandColour.trim()) ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onColours([...draft.colours, draft.brandColour.trim()])}
            >
              Add “{draft.brandColour.trim()}”
            </button>
          ) : null
        }
      />

      <SwatchPicker
        colours={swatchColours(draft)}
        hexes={draft.colourHexes}
        onChange={(colour, hex) => {
          const next = { ...draft.colourHexes };
          if (hex) next[colour] = hex;
          else delete next[colour];
          update({ colourHexes: next });
        }}
        families={colourFamilies}
        chosenFamilies={draft.colourFamilies}
        onFamily={(colour, family) => onColourFamily(colour, family)}
        onSuggested={(colour, family) => onColourFamily(colour, family, true)}
      />

      {spec.freeOptions ? (
        // No list to pick from: the seller names each option ("128 GB", "Large").
        <div
          className="lf-field lf-field--wide"
          data-missing={missing.has(SIZE_PICKER_ID) || undefined}
        >
          <ChipInput
            id={SIZE_PICKER_ID}
            label={
              <>
                <span>{optionLabel}s</span>
                <RequiredMark />
              </>
            }
            noun={noun}
            values={draft.sizes}
            onChange={onSizes}
            max={40}
            placeholder={
              spec.optionValues?.length
                ? `e.g. ${spec.optionValues[0]}`
                : optionLabel === 'Variant'
                  ? 'e.g. 128 GB Black'
                  : 'e.g. Large'
            }
            hint={`Type each ${noun} this product comes in and press Enter. One row per ${noun} is created below.`}
            extra={
              // The category's suggested values, one click each; typing others is fine.
              spec.optionValues?.some((v) => !draft.sizes.includes(v)) ? (
                <span className="lf-inline lf-wrap" role="group" aria-label={`Suggested ${noun}s`}>
                  {spec.optionValues
                    .filter((v) => !draft.sizes.includes(v))
                    .map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="lf-pill"
                        onClick={() => onSizes([...draft.sizes, v])}
                      >
                        + {v}
                      </button>
                    ))}
                </span>
              ) : null
            }
          />
          {missing.has(SIZE_PICKER_ID) && <p className="lf-missing-msg">Needed to go live</p>}
        </div>
      ) : (
      <div
        className="lf-field lf-field--wide"
        data-missing={missing.has(SIZE_PICKER_ID) || undefined}
      >
        <label htmlFor={SIZE_PICKER_ID} className="lf-label">
          <span>{optionLabel}s</span>
          <RequiredMark />
        </label>
        {groups.length > 0 && (
          <div className="lf-inline lf-wrap" role="group" aria-label="Add a group of sizes">
            {groups.map((group) => {
              const all = group.sizes.every((s) => draft.sizes.includes(s));
              return (
                <button
                  key={group.label}
                  type="button"
                  className="lf-pill"
                  aria-pressed={all}
                  onClick={() =>
                    onSizes(
                      all
                        ? draft.sizes.filter((s) => !group.sizes.includes(s))
                        : [...draft.sizes, ...group.sizes.filter((s) => !draft.sizes.includes(s))]
                    )
                  }
                >
                  {all ? '− ' : '+ '}
                  {group.label}
                </button>
              );
            })}
          </div>
        )}
        <input
          id={SIZE_PICKER_ID}
          type="search"
          className="lf-input"
          value={query}
          placeholder={`Search ${spec.sizes.length} ${spec.articleType} sizes`}
          aria-describedby="lf-size-help"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              const exact =
                spec.sizes.find((s) => s.toLowerCase() === q) ??
                (matches.length === 1 ? matches[0] : null);
              if (exact) {
                toggle(exact);
                setQuery('');
              }
            }
          }}
        />
        <p id="lf-size-help" className="lf-hint">
          {draft.sizes.length
            ? `${draft.sizes.length} selected. Press Enter to toggle an exact match.`
            : `Pick at least one ${noun}. Press Enter to toggle an exact match.`}
        </p>
        <div className="lf-size-box" role="group" aria-label={`${optionLabel}s`}>
          {matches.length === 0 && <p className="lf-hint">No {noun} matches “{query}”.</p>}
          {matches.map((size) => (
            <button
              key={size}
              type="button"
              className="lf-size"
              aria-pressed={draft.sizes.includes(size)}
              onClick={() => toggle(size)}
            >
              {size}
            </button>
          ))}
        </div>
        {missing.has(SIZE_PICKER_ID) && <p className="lf-missing-msg">Needed to go live</p>}
      </div>
      )}

      {draft.rows.length === 0 ? (
        <TextField
          id={fieldId('quantity')}
          label="Stock"
          type="number"
          min={0}
          step={1}
          value={draft.quantity}
          onChange={(value) => update({ quantity: value })}
          hint={`Used only while the listing has no ${noun}s.`}
        />
      ) : (
        <>
          <h3 className="lf-subhead">
            {optionLabel} rows ({draft.rows.length})
          </h3>
          <div className="lf-inline lf-wrap lf-bulk">
            <span className="lf-muted">Set every row:</span>
            {apparel && (
              <>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => draft.rows.forEach((_, i) => onRow(i, { sizeOnLabel: 'Yes' }))}
                >
                  Size on label: Yes
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => draft.rows.forEach((_, i) => onRow(i, { sizeOnLabel: 'No' }))}
                >
                  Size on label: No
                </button>
              </>
            )}
            <label htmlFor="lf-bulk-stock" className="sr-only">
              Stock for every row
            </label>
            <input
              id="lf-bulk-stock"
              type="number"
              min={0}
              className="lf-input lf-input--xs"
              placeholder="Stock"
              value={bulkStock}
              onChange={(event) => setBulkStock(event.target.value)}
            />
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={bulkStock === ''}
              onClick={() => draft.rows.forEach((_, i) => onRow(i, { quantity: bulkStock }))}
            >
              Apply stock
            </button>
          </div>
          <div className="lf-table-scroll">
            <table className="lf-table">
              <caption className="sr-only">One row per colour and {noun}</caption>
              <thead>
                <tr>
                  <th scope="col">{optionLabel}</th>
                  <th scope="col">
                    {apparel ? 'Size SKU' : 'SKU'}{' '}
                    <span className="lf-req-star" aria-hidden="true">
                      *
                    </span>
                  </th>
                  {apparel && (
                    <>
                      <th scope="col">
                        Standard size{' '}
                        {req('standardSize') && (
                          <span className="lf-req-star" aria-hidden="true">
                            *
                          </span>
                        )}
                      </th>
                      <th scope="col">
                        Size on label{' '}
                        {req('sizeOnLabel') && (
                          <span className="lf-req-star" aria-hidden="true">
                            *
                          </span>
                        )}
                      </th>
                    </>
                  )}
                  <th scope="col">
                    GTIN{' '}
                    {req('gtin') && (
                      <span className="lf-req-star" aria-hidden="true">
                        *
                      </span>
                    )}
                  </th>
                  <th scope="col">Stock</th>
                  <th scope="col">Price (₹)</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.rows.map((row, index) => {
                  const name = `${row.colour ? `${row.colour} / ` : ''}${row.size || `no ${noun}`}`;
                  return (
                    <tr key={row.key + (row.id ?? '')}>
                      <th scope="row" className="lf-row-name">
                        {row.size || '—'}
                        {row.colour && <span className="lf-muted"> {row.colour}</span>}
                        {row.id ? null : <span className="lf-new">new</span>}
                      </th>
                      <td>
                        <label htmlFor={rowFieldId(index, 'sku')} className="sr-only">
                          {apparel ? 'Size SKU' : 'SKU'} for {name} (required)
                        </label>
                        <input
                          id={rowFieldId(index, 'sku')}
                          className="lf-input lf-mono lf-input--sku"
                          value={row.sku}
                          aria-invalid={cellInvalid(rowFieldId(index, 'sku'))}
                          onChange={(event) =>
                            onRow(index, {
                              sku: event.target.value.toUpperCase(),
                              skuTouched: true,
                            })
                          }
                        />
                      </td>
                      {apparel && (
                      <>
                      <td>
                        <label htmlFor={rowFieldId(index, 'standardSize')} className="sr-only">
                          Standard size for {name}
                          {req('standardSize') ? ' (required)' : ''}
                        </label>
                        <select
                          id={rowFieldId(index, 'standardSize')}
                          className="lf-input lf-input--sm"
                          value={row.standardSize}
                          aria-invalid={cellInvalid(rowFieldId(index, 'standardSize'))}
                          onChange={(event) => onRow(index, { standardSize: event.target.value })}
                        >
                          <option value="">Select…</option>
                          {row.standardSize && !spec.sizes.includes(row.standardSize) && (
                            <option value={row.standardSize}>{row.standardSize}</option>
                          )}
                          {spec.sizes.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <label htmlFor={rowFieldId(index, 'sizeOnLabel')} className="sr-only">
                          Standard size on label for {name}
                          {req('sizeOnLabel') ? ' (required)' : ''}
                        </label>
                        <select
                          id={rowFieldId(index, 'sizeOnLabel')}
                          className="lf-input lf-input--xs"
                          value={row.sizeOnLabel}
                          aria-invalid={cellInvalid(rowFieldId(index, 'sizeOnLabel'))}
                          onChange={(event) =>
                            onRow(index, { sizeOnLabel: event.target.value as YesNo })
                          }
                        >
                          <option value="">—</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </td>
                      </>
                      )}
                      <td>
                        <label htmlFor={rowFieldId(index, 'gtin')} className="sr-only">
                          GTIN for {name}
                          {req('gtin') ? ' (required)' : ''}
                        </label>
                        <input
                          id={rowFieldId(index, 'gtin')}
                          className="lf-input lf-mono lf-input--gtin"
                          inputMode="numeric"
                          maxLength={14}
                          value={row.gtin}
                          aria-invalid={cellInvalid(rowFieldId(index, 'gtin'))}
                          onChange={(event) =>
                            onRow(index, { gtin: event.target.value.replace(/\D/g, '') })
                          }
                        />
                      </td>
                      <td>
                        <label htmlFor={rowFieldId(index, 'quantity')} className="sr-only">
                          Stock for {name}
                        </label>
                        <input
                          id={rowFieldId(index, 'quantity')}
                          type="number"
                          min={0}
                          step={1}
                          className="lf-input lf-input--xs"
                          value={row.quantity}
                          onChange={(event) => onRow(index, { quantity: event.target.value })}
                        />
                      </td>
                      <td>
                        <label htmlFor={rowFieldId(index, 'price')} className="sr-only">
                          Price override for {name}
                        </label>
                        <input
                          id={rowFieldId(index, 'price')}
                          type="number"
                          min={0}
                          step="0.01"
                          className="lf-input lf-input--xs"
                          placeholder={draft.price || '—'}
                          value={row.price}
                          onChange={(event) => onRow(index, { price: event.target.value })}
                        />
                      </td>
                      <td>
                        {!row.size && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            aria-label={`Remove ${name}`}
                            onClick={() => onRemoveRow(index)}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="lf-hint">
            <span aria-hidden="true">*</span> Required to go live. Price is optional — leave it
            empty to use the selling price. Deselect a {noun} above to remove its rows.
          </p>
        </>
      )}

      {(basis || (draft.sizes.length > 0 && measures.length > 0)) && (
        <h3 className="lf-subhead">Measurements (inches)</h3>
      )}
      {/* Shown before any size is picked: it is required on several types
          (Trousers, Rompers), and a field that only appeared after the sizes
          was one the checklist asked for but the page did not show. */}
      {basis && (
        <div className="lf-grid">
          <SelectField
            id={fieldId('measurementBasis')}
            label={basis.label === 'Body or Garment Size' ? 'Measured on' : basis.label}
            required={basis.required}
            value={draft.measurementBasis}
            options={(basis.options ?? []).map((value) => ({
              value,
              label: BASIS_LABELS[value] ?? value,
            }))}
            onChange={(value) => update({ measurementBasis: value })}
          />
        </div>
      )}
      {draft.sizes.length > 0 && measures.length > 0 && (
        <>
          <div className="lf-table-scroll">
            <table className="lf-table lf-table--measure">
              <caption className="sr-only">Measurements in inches, one row per size</caption>
              <thead>
                <tr>
                  <th scope="col">Size</th>
                  {measures.map((column) => (
                    <th scope="col" key={column.key}>
                      {column.label.replace(/\s*\(in\)$/, '')}
                      {column.required && (
                        <span className="lf-req-star" aria-hidden="true">
                          *
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draft.sizes.map((size, sizeIndex) => (
                  <tr key={size}>
                    <th scope="row" className="lf-row-name">
                      {size}
                    </th>
                    {measures.map((column) => {
                      const id = measureId(sizeIndex, column.key);
                      return (
                        <td key={column.key}>
                          <label htmlFor={id} className="sr-only">
                            {column.label} for size {size}
                            {column.required ? ' (required)' : ''}
                          </label>
                          <input
                            id={id}
                            type="number"
                            min={0}
                            max={200}
                            step="0.1"
                            inputMode="decimal"
                            className="lf-input lf-input--xs"
                            value={draft.measurements[size]?.[column.key] ?? ''}
                            aria-invalid={cellInvalid(id)}
                            onChange={(event) => onMeasure(size, column.key, event.target.value)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="lf-hint">
            <span aria-hidden="true">*</span> Required to go live. Every colour of a size shares its
            measurements.
            {measures.some((column) => column.anyOf?.length) &&
              ' Bust and chest are either-or: fill whichever the garment is measured on.'}
          </p>
        </>
      )}
    </>
  );
};
