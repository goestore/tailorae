'use client';

import React, { useState } from 'react';
import { customWearContent } from '@/config/custom-wear/content';
import { submitQuoteRequest } from '@/lib/custom-wear/api';
import { trackCustomWearEvent } from '@/lib/custom-wear/analytics';
import { Modal } from '@/components/common';
import type {
  CustomWearProduct,
  CustomizationSelection,
  QuoteRequestPayload,
  QuoteRequestResult,
} from '@/types/custom-wear';

export interface QuoteSheetProps {
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

const EMPTY: FormState = {
  customerName: '',
  company: '',
  email: '',
  phone: '',
  country: 'India',
  postcode: '',
  requiredBy: '',
  notes: '',
};

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
const isPhone = (value: string) => /^\d{10}$/.test(value.replace(/\D/g, ''));

/**
 * Quote request.
 *
 * Only four fields are required — who you are, how to reach you and where it
 * ships. Everything about the garment itself is already known from the build,
 * so it is summarised rather than re-asked.
 */
export const QuoteSheet: React.FC<QuoteSheetProps> = ({
  isOpen,
  onClose,
  product,
  colorId,
  sizes,
  quantity,
  customization,
}) => {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [isSubmitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<QuoteRequestResult | null>(null);

  const color = product.colors.find((entry) => entry.id === colorId);
  const set = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.customerName.trim()) next.customerName = 'Tell us who to reply to.';
    if (!form.email.trim()) next.email = 'We need an email to send the quote.';
    else if (!isEmail(form.email)) next.email = 'That email does not look right.';
    if (form.phone.trim() && !isPhone(form.phone)) next.phone = 'Enter 10 digits, or leave blank.';
    if (!form.country.trim()) next.country = 'Select a country.';
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
      placements: customization.placements.map((placement) => ({
        location: placement.location,
        method: placement.method,
        templateId: placement.templateId,
        designFileName:
          customization.uploads.find((upload) => upload.id === placement.uploadId)?.name ?? null,
        widthPercent: Math.round(placement.scale * 100),
      })),
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
        caught instanceof Error ? caught.message : 'We could not submit that. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
    // Keep a failed attempt's data; clear only after a success.
    if (result) {
      setResult(null);
      setForm(EMPTY);
      setErrors({});
      setSubmitError(null);
    }
  };

  const field = (
    key: keyof FormState,
    label: string,
    type = 'text',
    required = false
  ) => (
    <label className="cw-art-field">
      <span>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </span>
      <input
        suppressHydrationWarning
        type={type}
        value={form[key]}
        required={required}
        aria-invalid={errors[key] ? true : undefined}
        onChange={(event) => set(key, event.target.value)}
      />
      {errors[key] && (
        <span role="alert" className="cw-art-error">
          {errors[key]}
        </span>
      )}
    </label>
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={result ? 'Request received' : 'Request a quote'}>
      {result ? (
        <div className="cw-quote-done">
          <p className="cw-quote-ref">{result.reference}</p>
          <p>
            {result.persisted
              ? 'Our team will reply with pricing, lead times and a digital proof.'
              : 'Your request was received and logged. A quote backend is not connected yet, so keep this reference and follow up if you do not hear back.'}
          </p>
          <button suppressHydrationWarning type="button" onClick={handleClose} className="cw-cta cw-cta--accent w-full">
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="cw-quote">
          <p className="cw-quote-summary">
            {product.name} · {color?.name ?? 'colour TBC'} ·{' '}
            {sizes.length > 0 ? sizes.join(', ') : 'sizes TBC'} · {quantity} units ·{' '}
            {customization.placements.length} print area
            {customization.placements.length === 1 ? '' : 's'}
          </p>

          <div className="cw-quote-grid">
            {field('customerName', 'Name', 'text', true)}
            {field('company', 'Company')}
            {field('email', 'Email', 'email', true)}
            {field('phone', 'Phone')}

            <label className="cw-art-field">
              <span>
                Country<span aria-hidden="true"> *</span>
              </span>
              <select
                suppressHydrationWarning
                value={form.country}
                onChange={(event) => set('country', event.target.value)}
              >
                {customWearContent.quote.countries.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </label>

            {field('postcode', 'Postcode')}
            {field('requiredBy', 'Needed by', 'date')}
          </div>

          <label className="cw-art-field">
            <span>Anything else</span>
            <textarea
              suppressHydrationWarning
              rows={2}
              value={form.notes}
              onChange={(event) => set('notes', event.target.value)}
            />
          </label>

          {submitError && (
            <p role="alert" className="cw-art-error">
              {submitError}
            </p>
          )}

          <button
            suppressHydrationWarning
            type="submit"
            disabled={isSubmitting}
            className="cw-cta cw-cta--accent w-full"
          >
            {isSubmitting ? 'Sending…' : 'Send request'}
          </button>
        </form>
      )}
    </Modal>
  );
};
