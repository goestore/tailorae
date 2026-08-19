'use client';

import React from 'react';
import {
  CUSTOMIZATION_LOCATION_LABELS,
  CUSTOMIZATION_METHOD_OPTIONS,
} from '@/config/custom-wear/taxonomy';
import { customWearContent } from '@/config/custom-wear/content';
import type {
  CustomWearProduct,
  CustomizationLocationId,
  CustomizationMethodId,
  CustomizationSelection,
  DesignTemplate,
} from '@/types/custom-wear';
import { DesignUploader } from './DesignUploader';
import { GarmentLocationMap } from './GarmentLocationMap';

export interface CustomizationPanelProps {
  product: CustomWearProduct;
  selection: CustomizationSelection;
  onChange: (selection: CustomizationSelection) => void;
  onBrowseDesigns: () => void;
  selectedTemplate?: DesignTemplate;
  error?: string;
}

/**
 * "Customize Your Product": design source, branding locations and decoration
 * method. Produces a `CustomizationSelection`, the same object the future
 * canvas editor will emit — so the flow downstream never has to change.
 */
export const CustomizationPanel: React.FC<CustomizationPanelProps> = ({
  product,
  selection,
  onChange,
  onBrowseDesigns,
  selectedTemplate,
  error,
}) => {
  const { labels } = customWearContent;

  const supportedLocations = product.customizationLocations.filter((entry) => entry.supported);

  const toggleLocation = (location: CustomizationLocationId) => {
    const isSelected = selection.locations.includes(location);
    onChange({
      ...selection,
      locations: isSelected
        ? selection.locations.filter((entry) => entry !== location)
        : [...selection.locations, location],
    });
  };

  const setMethod = (method: CustomizationMethodId) =>
    onChange({ ...selection, method: selection.method === method ? null : method });

  return (
    <section
      style={{
        border: '1px solid var(--cw-border)',
        borderRadius: 'var(--cw-radius-card)',
        padding: '16px',
      }}
    >
      <h2
        style={{
          margin: '0 0 4px',
          fontFamily: 'var(--cw-font-heading)',
          fontSize: '19px',
          fontWeight: 600,
          color: 'var(--cw-ink)',
        }}
      >
        Customize Your Product
      </h2>
      <p
        style={{
          margin: '0 0 14px',
          color: 'var(--cw-ink-subtle)',
          fontFamily: 'var(--cw-font-body)',
          fontSize: 'var(--cw-fs-micro)',
          lineHeight: 1.6,
        }}
      >
        Start from a template or upload your own artwork, then choose where it goes and how it is
        applied.
      </p>

      {/* Design source */}
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <button
          suppressHydrationWarning
          type="button"
          onClick={onBrowseDesigns}
          className="cw-cta cw-cta--outline flex-1 py-3"
        >
          {labels.browseDesigns}
        </button>
        <button
          suppressHydrationWarning
          type="button"
          onClick={() => {
            document
              .getElementById('cw-design-uploader')
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            document
              .querySelector<HTMLInputElement>('#cw-design-uploader input[type="file"]')
              ?.click();
          }}
          className="cw-cta flex-1 py-3"
        >
          {labels.uploadDesign}
        </button>
      </div>

      {selectedTemplate && (
        <div
          className="mt-3 flex items-center justify-between gap-3 px-3 py-2.5"
          style={{
            backgroundColor: 'var(--cw-primary-soft)',
            border: '1px solid var(--cw-primary)',
            borderRadius: 'var(--cw-radius-control)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-micro)',
              fontWeight: 600,
              color: 'var(--cw-ink)',
            }}
          >
            Template selected: {selectedTemplate.name}
          </span>
          <button
            suppressHydrationWarning
            type="button"
            onClick={() => onChange({ ...selection, templateId: null })}
            className="underline"
            style={{
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-micro)',
              fontWeight: 600,
              color: 'var(--cw-ink-muted)',
            }}
          >
            Remove
          </button>
        </div>
      )}

      <div id="cw-design-uploader" className="mt-4">
        <DesignUploader
          uploads={selection.uploads}
          productId={product.id}
          onChange={(uploads) => onChange({ ...selection, uploads })}
        />
      </div>

      {/* Locations */}
      <div className="mt-6">
        <h3
          style={{
            margin: '0 0 10px',
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-small)',
            fontWeight: 700,
            color: 'var(--cw-ink)',
          }}
        >
          Branding Locations
          <span style={{ fontWeight: 400, color: 'var(--cw-ink-subtle)' }}>
            {' '}
            · {selection.locations.length} selected
          </span>
        </h3>

        <GarmentLocationMap
          locations={supportedLocations}
          selected={selection.locations}
          onToggle={toggleLocation}
        />

        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Branding locations">
          {supportedLocations.map((location) => {
            const isSelected = selection.locations.includes(location.id);
            return (
              <button
                suppressHydrationWarning
                key={location.id}
                type="button"
                onClick={() => toggleLocation(location.id)}
                aria-pressed={isSelected}
                className="transition-colors"
                style={{
                  fontFamily: 'var(--cw-font-body)',
                  fontSize: 'var(--cw-fs-micro)',
                  fontWeight: 600,
                  padding: '8px 11px',
                  borderRadius: 'var(--cw-radius-chip)',
                  border: `1px solid ${isSelected ? 'var(--cw-primary)' : 'var(--cw-border)'}`,
                  backgroundColor: isSelected ? 'var(--cw-primary)' : 'var(--cw-white)',
                  color: isSelected ? 'var(--cw-on-primary)' : 'var(--cw-ink-muted)',
                }}
              >
                {CUSTOMIZATION_LOCATION_LABELS[location.id]}
                {location.maxWidthMm && (
                  <span style={{ fontWeight: 400, opacity: 0.75 }}>
                    {' '}
                    · {location.maxWidthMm}×{location.maxHeightMm}mm
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Method */}
      <div className="mt-6">
        <h3
          style={{
            margin: '0 0 10px',
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-small)',
            fontWeight: 700,
            color: 'var(--cw-ink)',
          }}
        >
          Customization Method
        </h3>

        <div
          role="radiogroup"
          aria-label="Customization method"
          className="grid gap-2 sm:grid-cols-2"
        >
          {CUSTOMIZATION_METHOD_OPTIONS.map((option) => {
            const productMethod = product.customizationMethods.find(
              (entry) => entry.id === option.id
            );
            const isSupported = productMethod?.supported ?? false;
            const isSelected = selection.method === option.id;

            return (
              <button
                suppressHydrationWarning
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={!isSupported}
                onClick={() => setMethod(option.id)}
                className="flex flex-col items-start gap-1 p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                style={{
                  borderRadius: 'var(--cw-radius-control)',
                  border: `1px solid ${isSelected ? 'var(--cw-primary)' : 'var(--cw-border)'}`,
                  backgroundColor: isSelected ? 'var(--cw-primary-soft)' : 'var(--cw-white)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--cw-font-body)',
                    fontSize: 'var(--cw-fs-micro)',
                    fontWeight: 700,
                    color: 'var(--cw-ink)',
                  }}
                >
                  {option.label}
                  {isSelected && <span className="sr-only"> (selected)</span>}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--cw-font-body)',
                    fontSize: '11px',
                    color: 'var(--cw-ink-subtle)',
                    lineHeight: 1.5,
                  }}
                >
                  {isSupported
                    ? option.description
                    : (productMethod?.note ?? 'Not available on this product')}
                </span>
                {isSupported && productMethod && (
                  <span
                    style={{
                      fontFamily: 'var(--cw-font-body)',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--cw-ink-muted)',
                    }}
                  >
                    +₹{productMethod.pricePerUnit}/unit
                    {productMethod.setupFee
                      ? ` · ₹${productMethod.setupFee} setup`
                      : ' · no setup fee'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div className="mt-5">
        <label
          htmlFor="cw-customization-notes"
          style={{
            display: 'block',
            marginBottom: '6px',
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-small)',
            fontWeight: 700,
            color: 'var(--cw-ink)',
          }}
        >
          Customization Notes
        </label>
        <textarea
          suppressHydrationWarning
          id="cw-customization-notes"
          rows={3}
          value={selection.notes}
          onChange={(event) => onChange({ ...selection, notes: event.target.value })}
          placeholder="Pantone references, thread colours, name and number lists, anything our team should know."
          className="w-full"
        />
      </div>

      {error && (
        <p
          role="alert"
          style={{
            margin: '10px 0 0',
            color: 'var(--cw-danger)',
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-micro)',
          }}
        >
          {error}
        </p>
      )}
    </section>
  );
};
