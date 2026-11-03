'use client';

import React from 'react';
import type { ArticleSpec, SpecColumn } from '@/lib/catalogue-api';
import { AreaField, SelectField, TextField, type Option } from './controls';
import { fieldId, type FormMode, type ListingDraft } from './model';

export const productColumn = (spec: ArticleSpec | null, field: string): SpecColumn | undefined =>
  spec?.columns.find((c) => c.scope === 'product' && c.field === field);

interface BusinessSectionProps {
  mode: FormMode;
  draft: ListingDraft;
  spec: ArticleSpec | null;
  brands: Option[];
  update: (patch: Partial<ListingDraft>) => void;
  onName: (name: string) => void;
  onSku: (sku: string) => void;
  onSlug: (slug: string) => void;
  /** Adds a brand and selects it. */
  onAddBrand?: (name: string) => Promise<void>;
}

/** Article identity, price, colours, classification and the legal block. */
export const BusinessSection: React.FC<BusinessSectionProps> = ({
  mode,
  draft,
  spec,
  brands,
  update,
  onName,
  onSku,
  onSlug,
  onAddBrand,
}) => {
  const [newBrand, setNewBrand] = React.useState('');
  const [addingBrand, setAddingBrand] = React.useState(false);
  const [brandError, setBrandError] = React.useState<string | null>(null);
  const addBrand = async () => {
    if (!onAddBrand || newBrand.trim().length < 2) return;
    setAddingBrand(true);
    setBrandError(null);
    try {
      await onAddBrand(newBrand.trim());
      setNewBrand('');
    } catch (error) {
      setBrandError((error as Error).message);
    } finally {
      setAddingBrand(false);
    }
  };
  const col = (field: string) => productColumn(spec, field);
  const req = (field: string) => Boolean(col(field)?.required);
  const opts = (field: string) => col(field)?.options ?? [];
  const label = (field: string, fallback: string) => col(field)?.label ?? fallback;

  const mrp = Number(draft.originalPrice);
  const isp = Number(draft.price);
  const discount =
    draft.originalPrice !== '' && draft.price !== '' && mrp > 0 && isp > 0 && isp <= mrp
      ? Math.round(((mrp - isp) / mrp) * 100)
      : null;

  const years = [...opts('year')].sort((a, b) => Number(b) - Number(a));
  const countryOptions = opts('countriesOfOrigin.0');
  // Show one more country slot than are filled, up to five.
  const filledCountries = draft.countriesOfOrigin.filter(Boolean).length;
  const countrySlots = Math.min(5, Math.max(1, filledCountries + 1));

  const select = (field: keyof ListingDraft & string, fallback: string, hint?: string) =>
    col(field) ? (
      <SelectField
        id={fieldId(field)}
        label={label(field, fallback)}
        required={req(field)}
        value={draft[field] as string}
        options={opts(field)}
        hint={hint}
        onChange={(value) => update({ [field]: value } as Partial<ListingDraft>)}
      />
    ) : null;

  return (
    <>
      <h3 className="lf-subhead">Identity</h3>
      <div className="lf-grid">
        <TextField
          id={fieldId('name')}
          label={label('name', 'Article name')}
          required
          value={draft.name}
          onChange={onName}
          maxLength={200}
          hint="Your internal name for the garment."
        />
        <TextField
          id={fieldId('displayName')}
          label={label('displayName', 'Display name')}
          required={req('displayName')}
          value={draft.displayName}
          onChange={(value) => update({ displayName: value })}
          maxLength={200}
          hint="What shoppers see as the product title."
        />
        <TextField
          id={fieldId('listViewName')}
          label={label('listViewName', 'List view name')}
          required={req('listViewName')}
          value={draft.listViewName}
          onChange={(value) => update({ listViewName: value })}
          maxLength={120}
          hint="Short title for search results and grids."
        />
        <TextField
          id={fieldId('sku')}
          label={label('sku', 'Article number (SKU)')}
          required
          mono
          value={draft.sku}
          onChange={onSku}
          maxLength={60}
          hint="Suggested from the name; must be unique."
        />
        <TextField
          id={fieldId('slug')}
          label="URL slug"
          mono
          value={draft.slug}
          onChange={onSlug}
          maxLength={80}
          hint="Made from the name. Used in the product page address."
        />
        <TextField
          id={fieldId('styleGroupId')}
          label={label('styleGroupId', 'Style group ID')}
          mono
          value={draft.styleGroupId}
          onChange={(value) => update({ styleGroupId: value })}
          maxLength={80}
          placeholder={draft.sku || 'Same as article number'}
          hint="Ties this style's size rows together in a Myntra sheet. Defaults to the article number."
        />
        <TextField
          id={fieldId('colourGroupId')}
          label={label('colourGroupId', 'Colour group')}
          mono
          value={draft.colourGroupId}
          onChange={(value) => update({ colourGroupId: value })}
          maxLength={80}
          placeholder="e.g. CKGDAI-8391"
          hint="The same value on every colour of this design links them on the product page. “Add another colour” fills it for you."
        />
        <SelectField
          id={fieldId('brandId')}
          label={label('brand', 'Brand')}
          required={req('brand')}
          value={draft.brandId}
          options={brands}
          placeholder={brands.length ? 'Select a brand…' : 'No brands available'}
          hint={
            mode === 'seller'
              ? 'Not listed? Add your brand below. It can be used straight away.'
              : brands.length === 0
                ? 'No brands yet. Add one below.'
                : undefined
          }
          onChange={(value) => update({ brandId: value })}
        />
        {onAddBrand && (
          <div className="lf-field">
            <label htmlFor="lf-new-brand" className="lf-label">
              Add a brand
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="lf-new-brand"
                className="lf-input"
                value={newBrand}
                maxLength={80}
                placeholder="Brand name as printed on the label"
                onChange={(event) => setNewBrand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void addBrand();
                  }
                }}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button
                type="button"
                className="btn btn-sm"
                disabled={addingBrand || newBrand.trim().length < 2}
                onClick={() => void addBrand()}
              >
                {addingBrand ? 'Adding…' : 'Add'}
              </button>
            </div>
            {brandError && (
              <p role="alert" className="lf-missing-msg">
                {brandError}
              </p>
            )}
          </div>
        )}
      </div>

      <h3 className="lf-subhead">Price</h3>
      <div className="lf-grid">
        <TextField
          id={fieldId('originalPrice')}
          label={`${label('originalPrice', 'MRP')} (₹)`}
          required={req('originalPrice')}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={draft.originalPrice}
          onChange={(value) => update({ originalPrice: value })}
        />
        <TextField
          id={fieldId('price')}
          label={`${label('price', 'Selling price (ISP)')} (₹)`}
          required
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={draft.price}
          onChange={(value) => update({ price: value })}
          hint={
            discount !== null
              ? `${discount}% off MRP`
              : draft.originalPrice && draft.price && isp > mrp
                ? 'Selling price is above the MRP.'
                : 'What the shopper pays.'
          }
        />
        {mode === 'admin' && (
          <TextField
            id={fieldId('costPrice')}
            label="Cost price (₹)"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={draft.costPrice}
            onChange={(value) => update({ costPrice: value })}
            hint="Optional. Never shown to shoppers."
          />
        )}
      </div>

      <h3 className="lf-subhead">Colour &amp; classification</h3>
      <div className="lf-grid">
        <TextField
          id={fieldId('brandColour')}
          label={label('brandColour', 'Brand colour')}
          required={req('brandColour')}
          value={draft.brandColour}
          onChange={(value) => update({ brandColour: value })}
          maxLength={80}
          hint="Your own name for it, e.g. “Dusty Rose”."
        />
        {select('primaryColour', 'Prominent colour')}
        {select('secondaryColour', 'Second prominent colour')}
        {select('tertiaryColour', 'Third prominent colour')}
        {select('ageGroup', 'Age group')}
        {select('fashionType', 'Fashion type')}
        {select('usage', 'Usage')}
        {col('year') && (
          <SelectField
            id={fieldId('year')}
            label={label('year', 'Year')}
            required={req('year')}
            value={draft.year}
            options={years}
            onChange={(value) => update({ year: value })}
          />
        )}
        {select('season', 'Season')}
        <TextField
          id={fieldId('hsn')}
          label={label('hsn', 'HSN')}
          required={req('hsn')}
          mono
          inputMode="numeric"
          value={draft.hsn}
          maxLength={8}
          onChange={(value) => update({ hsn: value.replace(/\D/g, '') })}
          hint="4 to 8 digits, e.g. 6204 for women’s dresses."
        />
      </div>

      <h3 className="lf-subhead">Origin &amp; legal</h3>
      <div className="lf-grid">
        {Array.from({ length: countrySlots }, (_, index) => {
          const field = `countriesOfOrigin.${index}`;
          return (
            <SelectField
              key={field}
              id={fieldId(field)}
              label={
                index === 0 ? label(field, 'Country of origin') : `Country of origin ${index + 1}`
              }
              required={index === 0 && req(field)}
              value={draft.countriesOfOrigin[index] ?? ''}
              options={countryOptions}
              name={`country ${index + 1}`}
              onChange={(value) => {
                const next = [...draft.countriesOfOrigin];
                next[index] = value;
                update({ countriesOfOrigin: next });
              }}
            />
          );
        })}
      </div>
      <div className="lf-grid">
        <AreaField
          id={fieldId('manufacturerDetails')}
          label={label('manufacturerDetails', 'Manufacturer name and address with pincode')}
          required={req('manufacturerDetails')}
          value={draft.manufacturerDetails}
          maxLength={500}
          onChange={(value) => update({ manufacturerDetails: value })}
        />
        <div className="lf-field lf-field--wide">
          <AreaField
            id={fieldId('packerDetails')}
            label={label('packerDetails', 'Packer name and address with pincode')}
            required={req('packerDetails')}
            value={draft.packerDetails}
            maxLength={500}
            onChange={(value) => update({ packerDetails: value })}
          />
          <div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!draft.manufacturerDetails.trim()}
              onClick={() => update({ packerDetails: draft.manufacturerDetails })}
            >
              Same as manufacturer
            </button>
          </div>
        </div>
        <AreaField
          id={fieldId('importerDetails')}
          label={label('importerDetails', 'Importer name and address with pincode')}
          required={req('importerDetails')}
          value={draft.importerDetails}
          maxLength={500}
          hint="Only for imported goods."
          onChange={(value) => update({ importerDetails: value })}
        />
      </div>
    </>
  );
};
