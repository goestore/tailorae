'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/common';
import {
  CUSTOMIZATION_LOCATION_LABELS,
  CUSTOMIZATION_METHOD_LABELS,
  sizeLabel,
} from '@/config/custom-wear/taxonomy';
import { customWearContent } from '@/config/custom-wear/content';
import { submitQuoteRequest } from '@/lib/custom-wear/api';
import { trackCustomWearEvent } from '@/lib/custom-wear/analytics';
import { isValidEmail, isValidPhone } from '@/utils/helpers';
import type {
  CustomWearProduct,
  CustomizationSelection,
  QuoteRequestPayload,
  QuoteRequestResult,
} from '@/types/custom-wear';

export interface QuoteRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: CustomWearProduct;
  colorId: string | null;
  sizes: string[];
  quantity: number;
  customization: CustomizationSelection;
}

interface FormState {
  customerName: string;
  company: string;
  email: string;
  phone: string;
  country: string;
  postcode: string;
  requiredBy: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  customerName: '',
  company: '',
  email: '',
  phone: '',
  country: customWearContent.quote.defaultCountry,
  postcode: '',
  requiredBy: '',
  notes: '',
};

/**
 * Quote request form.
 *
 * Product context (id, colour, sizes, quantity, method, locations, artwork file
 * names) is attached automatically — the buyer only fills in contact details.
 * The reference number is issued by the server, never generated here.
 */
export const QuoteRequestModal: React.FC<QuoteRequestModalProps> = ({
  isOpen,
  onClose,
  product,
  colorId,
  sizes,
  quantity,
  customization,
}) => {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [isSubmitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<QuoteRequestResult | null>(null);

  const color = product.colors.find((entry) => entry.id === colorId);

  const update = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.customerName.trim()) next.customerName = 'Tell us who to reply to.';
    if (!form.email.trim()) next.email = 'We need an email to send the quote.';
    else if (!isValidEmail(form.email)) next.email = 'That email address does not look right.';
    if (form.phone.trim() && !isValidPhone(form.phone))
      next.phone = 'Enter a 10-digit phone number, or leave it blank.';
    if (!form.country.trim()) next.country = 'Select a delivery country.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);

    const payload: QuoteRequestPayload = {
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      sku: product.sku,
      colorId: color?.id ?? null,
      colorName: color?.name ?? null,
      sizes,
      quantity,
      method: customization.method,
      locations: customization.locations,
      designFileNames: customization.uploads
        .filter((upload) => upload.status !== 'error')
        .map((upload) => upload.name),
      notes: [customization.notes, form.notes].filter(Boolean).join('\n\n'),
      customerName: form.customerName.trim(),
      company: form.company.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      country: form.country,
      postcode: form.postcode.trim(),
      requiredBy: form.requiredBy,
    };

    try {
      const response = await submitQuoteRequest(payload);
      setResult(response);
      trackCustomWearEvent('custom_wear_quote_submitted', {
        productId: product.id,
        quantity,
        reference: response.reference,
      });
    } catch (caught) {
      setSubmitError(
        caught instanceof Error
          ? caught.message
          : 'We could not submit your quote request. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
    // Reset only after a successful submission, so a failed attempt keeps its data.
    if (result) {
      setResult(null);
      setForm(EMPTY_FORM);
      setErrors({});
      setSubmitError(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={result ? 'Quote Request Received' : 'Request a Quote'}
      size="lg"
    >
      {result ? (
        <div>
          <p
            style={{
              margin: '0 0 10px',
              fontFamily: 'var(--cw-font-body)',
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--cw-success)',
            }}
          >
            {customWearContent.labels.quoteSuccessTitle}
          </p>

          <dl
            className="mb-4 p-3.5"
            style={{
              backgroundColor: 'var(--cw-surface-alt)',
              borderRadius: 'var(--cw-radius-control)',
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-small)',
            }}
          >
            <dt style={{ color: 'var(--cw-ink-subtle)', fontSize: 'var(--cw-fs-micro)' }}>
              Your reference
            </dt>
            <dd
              style={{
                margin: '4px 0 0',
                fontSize: '18px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: 'var(--cw-ink)',
              }}
            >
              {result.reference}
            </dd>
          </dl>

          <p
            style={{
              margin: '0 0 8px',
              color: 'var(--cw-ink-muted)',
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-small)',
              lineHeight: 1.6,
            }}
          >
            Quote for <strong>{product.name}</strong> · {quantity} units. Our team replies with
            pricing, lead times and a digital proof.
          </p>

          {!result.persisted && (
            <p
              style={{
                margin: '0 0 16px',
                padding: '10px 12px',
                backgroundColor: 'var(--cw-primary-soft)',
                border: '1px solid var(--cw-primary)',
                borderRadius: 'var(--cw-radius-control)',
                color: 'var(--cw-ink-muted)',
                fontFamily: 'var(--cw-font-body)',
                fontSize: 'var(--cw-fs-micro)',
                lineHeight: 1.6,
              }}
            >
              Note for the site owner: the quote service is not connected yet, so this request was
              logged by the server but not written to the database. Point{' '}
              <code>CUSTOM_WEAR_QUOTE_API</code> at the quotes endpoint to store it.
            </p>
          )}

          <button
            suppressHydrationWarning
            type="button"
            onClick={handleClose}
            className="cw-cta cw-cta--accent w-full"
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <p
            style={{
              margin: '0 0 14px',
              color: 'var(--cw-ink-muted)',
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-small)',
              lineHeight: 1.6,
            }}
          >
            {customWearContent.quote.introText}
          </p>

          {/* Attached product context */}
          <div
            className="mb-5 p-3.5"
            style={{
              backgroundColor: 'var(--cw-surface-alt)',
              borderRadius: 'var(--cw-radius-control)',
            }}
          >
            <p
              className="uppercase"
              style={{
                margin: '0 0 8px',
                color: 'var(--cw-ink-subtle)',
                fontFamily: 'var(--cw-font-body)',
                fontSize: '10.5px',
                fontWeight: 700,
                letterSpacing: '0.12em',
              }}
            >
              Attached to this quote
            </p>
            <ul
              className="flex flex-col gap-1"
              style={{
                fontFamily: 'var(--cw-font-body)',
                fontSize: 'var(--cw-fs-micro)',
                color: 'var(--cw-ink-muted)',
              }}
            >
              <SummaryRow label="Product" value={`${product.name} (${product.sku})`} />
              <SummaryRow label="Colour" value={color?.name ?? 'Not selected'} />
              <SummaryRow
                label="Sizes"
                value={sizes.length ? sizes.map(sizeLabel).join(', ') : 'To be confirmed'}
              />
              <SummaryRow label="Quantity" value={`${quantity} units`} />
              <SummaryRow
                label="Method"
                value={
                  customization.method
                    ? CUSTOMIZATION_METHOD_LABELS[customization.method]
                    : 'To be advised'
                }
              />
              <SummaryRow
                label="Locations"
                value={
                  customization.locations.length
                    ? customization.locations
                        .map((location) => CUSTOMIZATION_LOCATION_LABELS[location])
                        .join(', ')
                    : 'To be advised'
                }
              />
              <SummaryRow
                label="Artwork"
                value={
                  customization.uploads.filter((upload) => upload.status !== 'error').length
                    ? customization.uploads
                        .filter((upload) => upload.status !== 'error')
                        .map((upload) => upload.name)
                        .join(', ')
                    : 'None attached'
                }
              />
            </ul>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field
              id="quote-name"
              label="Name"
              required
              value={form.customerName}
              error={errors.customerName}
              onChange={(value) => update('customerName', value)}
              autoComplete="name"
            />
            <Field
              id="quote-company"
              label="Company"
              value={form.company}
              onChange={(value) => update('company', value)}
              autoComplete="organization"
            />
            <Field
              id="quote-email"
              label="Email"
              type="email"
              required
              value={form.email}
              error={errors.email}
              onChange={(value) => update('email', value)}
              autoComplete="email"
            />
            <Field
              id="quote-phone"
              label="Phone"
              type="tel"
              value={form.phone}
              error={errors.phone}
              onChange={(value) => update('phone', value)}
              autoComplete="tel"
            />

            <div>
              <label htmlFor="quote-country" style={labelStyle}>
                Delivery Country <span aria-hidden="true">*</span>
              </label>
              <select
                suppressHydrationWarning
                id="quote-country"
                value={form.country}
                onChange={(event) => update('country', event.target.value)}
                className="w-full"
                required
              >
                {customWearContent.quote.countries.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </div>

            <Field
              id="quote-postcode"
              label="Delivery Postcode"
              value={form.postcode}
              onChange={(value) => update('postcode', value)}
              autoComplete="postal-code"
            />
            <Field
              id="quote-required-by"
              label="Required Delivery Date"
              type="date"
              value={form.requiredBy}
              onChange={(value) => update('requiredBy', value)}
            />
          </div>

          <div className="mt-3.5">
            <label htmlFor="quote-notes" style={labelStyle}>
              Additional Comments
            </label>
            <textarea
              suppressHydrationWarning
              id="quote-notes"
              rows={3}
              value={form.notes}
              onChange={(event) => update('notes', event.target.value)}
              className="w-full"
              placeholder="Size split, delivery split, budget, anything else we should know."
            />
          </div>

          {submitError && (
            <p
              role="alert"
              style={{
                margin: '14px 0 0',
                padding: '10px 12px',
                border: '1px solid var(--cw-danger)',
                borderRadius: 'var(--cw-radius-control)',
                color: 'var(--cw-danger)',
                fontFamily: 'var(--cw-font-body)',
                fontSize: 'var(--cw-fs-micro)',
              }}
            >
              {submitError}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row-reverse">
            <button
              suppressHydrationWarning
              type="submit"
              disabled={isSubmitting}
              className="cw-cta cw-cta--accent flex-1 py-3"
            >
              {isSubmitting ? 'Submitting…' : customWearContent.quote.submitLabel}
            </button>
            <button
              suppressHydrationWarning
              type="button"
              onClick={handleClose}
              className="cw-cta cw-cta--outline flex-1 py-3"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '5px',
  fontFamily: 'var(--cw-font-body)',
  fontSize: 'var(--cw-fs-micro)',
  fontWeight: 600,
  color: 'var(--cw-ink)',
};

const SummaryRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <li className="flex gap-2">
    <span style={{ minWidth: '78px', color: 'var(--cw-ink-subtle)' }}>{label}</span>
    <span style={{ color: 'var(--cw-ink)', fontWeight: 500 }}>{value}</span>
  </li>
);

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  error?: string;
  autoComplete?: string;
}

const Field: React.FC<FieldProps> = ({
  id,
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  error,
  autoComplete,
}) => (
  <div>
    <label htmlFor={id} style={labelStyle}>
      {label}
      {required && <span aria-hidden="true"> *</span>}
    </label>
    <input
      suppressHydrationWarning
      id={id}
      type={type}
      value={value}
      required={required}
      autoComplete={autoComplete}
      onChange={(event) => onChange(event.target.value)}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${id}-error` : undefined}
      className="w-full"
      style={error ? { borderColor: 'var(--cw-danger)' } : undefined}
    />
    {error && (
      <p
        id={`${id}-error`}
        role="alert"
        style={{
          margin: '4px 0 0',
          color: 'var(--cw-danger)',
          fontFamily: 'var(--cw-font-body)',
          fontSize: '11px',
        }}
      >
        {error}
      </p>
    )}
  </div>
);
