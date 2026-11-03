'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { CUSTOMIZATION_LOCATION_LABELS } from '@/config/custom-wear/taxonomy';
import { submitQuoteBatch } from '@/lib/custom-wear/api';
import { quoteLinePayload } from '@/lib/custom-wear/cart';
import { trackCustomWearEvent } from '@/lib/custom-wear/analytics';
import { ProductThumb } from '@/components/product';
import { formatCurrency } from '@/utils/helpers';
import { useAppDispatch, useAppSelector } from '@/store';
import { hydrateQuoteLines, removeQuoteLines } from '@/store/slices/customWear';
import type { QuoteContactPayload } from '@/types/custom-wear';
import { CustomWearThemeProvider } from './CustomWearThemeProvider';
import { QuoteContactSheet } from './studio/QuoteSheet';

/**
 * The cart's custom-wear section.
 *
 * Custom garments are made to order and priced by a person, so they are kept
 * apart from the payable basket: they never reach the checkout total, and the
 * action here is "request a quote", which stores one quote per line and then
 * clears them. Renders nothing when there are no custom-wear lines.
 */
export const CustomWearQuoteBasket: React.FC<{ className?: string }> = ({ className = '' }) => {
  const dispatch = useAppDispatch();
  const { quoteLines, quoteLinesHydrated } = useAppSelector((state) => state.customWear);
  const [isSheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    dispatch(hydrateQuoteLines());
  }, [dispatch]);

  // The sheet stays mounted after a successful request has emptied the list,
  // so its confirmation (the references) is still shown.
  if (!quoteLinesHydrated || (quoteLines.length === 0 && !isSheetOpen)) return null;

  const estimate = quoteLines.reduce((sum, line) => sum + line.estimatedTotal, 0);
  const units = quoteLines.reduce((sum, line) => sum + line.quantity, 0);

  const submit = async (contact: QuoteContactPayload, notes: string) => {
    const lines = quoteLines;
    const result = await submitQuoteBatch(
      contact,
      lines.map((line) => {
        const payload = quoteLinePayload(line);
        return { ...payload, notes: [payload.notes, notes].filter(Boolean).join('\n\n') };
      })
    );
    // Stored on the server: these lines are now quotes, so leave the basket.
    trackCustomWearEvent('custom_wear_quote_submitted', {
      quantity: units,
      reference: result.reference,
    });
    return { result, ids: lines.map((line) => line.id) };
  };

  return (
    <CustomWearThemeProvider>
      {quoteLines.length > 0 && (
      <section
        id="custom-wear"
        aria-labelledby="custom-wear-heading"
        className={`border border-line bg-white p-4 md:p-6 ${className}`.trim()}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p
              className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: 'var(--ink-3)' }}
            >
              Made to order
            </p>
            <h2 id="custom-wear-heading" className="m-0 mt-1 text-xl text-ink">
              Custom wear ({quoteLines.length})
            </h2>
          </div>
          <Link href="/custom-wear/quotes" className="text-sm font-medium underline">
            My custom wear quotes
          </Link>
        </div>
        <p className="mt-2 mb-4 max-w-[60ch] text-[13.5px]" style={{ color: 'var(--ink-2)', lineHeight: 1.6 }}>
          Printed and embroidered pieces are priced by our team after checking your artwork, so they
          are not paid at checkout. Request a quote and we will reply with a final price, lead time
          and a digital proof.
        </p>

        <ul className="m-0 list-none space-y-4 p-0">
          {quoteLines.map((line) => (
            <li key={line.id} className="flex gap-4 border-b pb-4 last:border-b-0 last:pb-0">
              <Link href={`/custom-wear/product/${line.productSlug}`}>
                <ProductThumb src={line.image} alt={line.productName} className="h-20 w-20 rounded" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/custom-wear/product/${line.productSlug}`}
                  className="line-clamp-1 font-semibold hover:text-primary-700"
                >
                  {line.productName}
                </Link>
                <p className="m-0 text-xs text-neutral-500">
                  {[
                    line.colorName,
                    line.sizes.length > 0 ? `Size ${line.sizes.join(', ')}` : null,
                    `${line.quantity} units`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {line.placements.length > 0 && (
                  <p className="m-0 mt-0.5 text-xs text-neutral-500">
                    {line.placements
                      .map(
                        (placement) =>
                          `${CUSTOMIZATION_LOCATION_LABELS[placement.location] ?? placement.location}${
                            placement.method ? ` (${placement.method.replace(/[-_]/g, ' ')})` : ''
                          }`
                      )
                      .join(', ')}
                    {line.designFiles.length > 0 &&
                      ` · ${line.designFiles.length} artwork file${line.designFiles.length === 1 ? '' : 's'}`}
                  </p>
                )}
                <p className="m-0 mt-2 text-sm text-neutral-700">
                  Estimate {formatCurrency(line.estimatedTotal)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dispatch(removeQuoteLines([line.id]))}
                className="self-start text-sm font-medium text-red-600 hover:text-red-800"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="m-0 text-sm" style={{ color: 'var(--ink-2)' }}>
            {units} units · indicative {formatCurrency(estimate)}
            <span className="block text-xs" style={{ color: 'var(--ink-3)' }}>
              Not included in your cart total
            </span>
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setSheetOpen(true)}>
            Request a quote for these
          </button>
        </div>
      </section>
      )}

      <QuoteContactSheet
        isOpen={isSheetOpen}
        onClose={() => setSheetOpen(false)}
        summary={`${quoteLines.length} custom garment${quoteLines.length === 1 ? '' : 's'} · ${units} units · one quote reference per garment`}
        submit={async (contact, notes) => {
          const { result, ids } = await submit(contact, notes);
          dispatch(removeQuoteLines(ids));
          toast.success(
            result.references.length > 1
              ? `${result.references.length} quote requests sent`
              : 'Quote request sent'
          );
          return result;
        }}
      />
    </CustomWearThemeProvider>
  );
};
