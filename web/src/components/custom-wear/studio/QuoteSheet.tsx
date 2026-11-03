'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import { customWearContent } from '@/config/custom-wear/content';
import { submitQuoteRequest } from '@/lib/custom-wear/api';
import { placementsFor, storedUploads } from '@/lib/custom-wear/cart';
import { trackCustomWearEvent } from '@/lib/custom-wear/analytics';
import { Modal } from '@/components/common';
import type { RootState } from '@/store';
import type {
  CustomWearProduct,
  CustomizationSelection,
  QuoteContactPayload,
  QuoteRequestResult,
} from '@/types/custom-wear';

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

export interface QuoteContactSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** One line describing what is being quoted. */
  summary: React.ReactNode;
  /** Blocks submission with this message (e.g. artwork still uploading). */
  blockedReason?: string | null;
  /** Stores the request; resolves only once the backend has kept it. */
  submit: (contact: QuoteContactPayload, notes: string) => Promise<QuoteRequestResult>;
  onSubmitted?: (result: QuoteRequestResult) => void;
}

/**
 * The contact half of a quote request: who you are, how to reach you and where
 * it ships. Shared by the product page (one garment) and the cart's custom-wear
 * section (several garments, one quote each).
 */
export const QuoteContactSheet: React.FC<QuoteContactSheetProps> = ({
  isOpen,
  onClose,
  summary,
  blockedReason,
  submit,
  onSubmitted,
}) => {
  const user = useSelector((state: RootState) => state.auth.user);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [isSubmitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<QuoteRequestResult | null>(null);

  // A signed-in customer's name and email are known; fill them in once.
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  if (user && prefilledFor !== user.id) {
    setPrefilledFor(user.id);
    setForm((current) => ({
      ...current,
      customerName:
        current.customerName || [user.firstName, user.lastName].filter(Boolean).join(' '),
      email: current.email || user.email,
      phone: current.phone || user.phone || '',
    }));
  }

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
    if (blockedReason || !validate()) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await submit(
        {
          customerName: form.customerName.trim(),
          company: form.company.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          country: form.country,
          postcode: form.postcode.trim(),
          requiredBy: form.requiredBy,
        },
        form.notes.trim()
      );
      setResult(response);
      onSubmitted?.(response);
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
      setForm((current) => ({ ...EMPTY, customerName: current.customerName, email: current.email }));
      setErrors({});
      setSubmitError(null);
    }
  };

  const field = (key: keyof FormState, label: string, type = 'text', required = false) => (
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

  const statusHref = result
    ? `/custom-wear/quotes?reference=${encodeURIComponent(result.reference)}&email=${encodeURIComponent(
        form.email.trim()
      )}`
    : '/custom-wear/quotes';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={result ? 'Request received' : 'Request a quote'}>
      {result ? (
        <div className="cw-quote-done">
          {result.references.map((reference) => (
            <p key={reference} className="cw-quote-ref">
              {reference}
            </p>
          ))}
          <p>
            Saved. Our team will reply to {form.email.trim()} with pricing, lead times and a
            digital proof. Keep {result.references.length > 1 ? 'these references' : 'this reference'}{' '}
            to check the status.
          </p>
          <Link href={statusHref} className="cw-cta cw-cta--outline w-full text-center" onClick={handleClose}>
            Check status
          </Link>
          <button suppressHydrationWarning type="button" onClick={handleClose} className="cw-cta cw-cta--accent w-full">
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="cw-quote">
          <p className="cw-quote-summary">{summary}</p>

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

          {(submitError || blockedReason) && (
            <p role="alert" className="cw-art-error">
              {submitError ?? blockedReason}
            </p>
          )}

          <button
            suppressHydrationWarning
            type="submit"
            disabled={isSubmitting || Boolean(blockedReason)}
            className="cw-cta cw-cta--accent w-full"
          >
            {isSubmitting ? 'Sending…' : 'Send request'}
          </button>
        </form>
      )}
    </Modal>
  );
};

export interface QuoteSheetProps {
  isOpen: boolean;
  onClose: () => void;
  product: CustomWearProduct;
  colorId: string | null;
  sizes: string[];
  quantity: number;
  customization: CustomizationSelection;
}

/**
 * Quote request for the garment on the product page. Everything about the
 * garment is already known from the build, so it is summarised rather than
 * re-asked; uploaded artwork travels as its stored URLs.
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
  const color = product.colors.find((entry) => entry.id === colorId);
  const uploading = customization.uploads.some((upload) => upload.status === 'uploading');

  const submit = async (contact: QuoteContactPayload, notes: string) => {
    const stored = storedUploads(customization);
    const response = await submitQuoteRequest({
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      sku: product.sku,
      colorId: color?.id ?? null,
      colorName: color?.name ?? null,
      sizes,
      quantity,
      placements: placementsFor(customization),
      designFileNames: stored.map((upload) => upload.name),
      designFiles: stored.map((upload) => upload.url as string),
      notes: [customization.notes, notes].filter(Boolean).join('\n\n'),
      ...contact,
    });
    trackCustomWearEvent('custom_wear_quote_submitted', {
      productId: product.id,
      quantity,
      reference: response.reference,
    });
    return response;
  };

  return (
    <QuoteContactSheet
      isOpen={isOpen}
      onClose={onClose}
      blockedReason={uploading ? 'Your artwork is still uploading. This will unlock in a moment.' : null}
      submit={submit}
      summary={
        <>
          {product.name} · {color?.name ?? 'colour TBC'} ·{' '}
          {sizes.length > 0 ? sizes.join(', ') : 'sizes TBC'} · {quantity} units ·{' '}
          {customization.placements.length} print area
          {customization.placements.length === 1 ? '' : 's'}
          {storedUploads(customization).length > 0 &&
            ` · ${storedUploads(customization).length} artwork file${
              storedUploads(customization).length === 1 ? '' : 's'
            }`}
        </>
      }
    />
  );
};
