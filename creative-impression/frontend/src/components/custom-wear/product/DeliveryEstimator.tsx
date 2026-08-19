'use client';

import React, { useState } from 'react';
import { formatCurrency } from '@/utils/helpers';
import { PostcodeError, estimateDelivery, formatDeliveryWindow } from '@/lib/custom-wear/shipping';
import type { DeliveryEstimate, DeliverySpeedId } from '@/types/custom-wear';

export interface DeliveryEstimatorProps {
  orderValue: number;
  speed: DeliverySpeedId;
  onSpeedChange: (speed: DeliverySpeedId) => void;
}

/**
 * Postcode-driven delivery estimate and speed selector.
 *
 * No city or region is hardcoded: everything is resolved by
 * `estimateDelivery`, which is the seam for the shipping API.
 */
export const DeliveryEstimator: React.FC<DeliveryEstimatorProps> = ({
  orderValue,
  speed,
  onSpeedChange,
}) => {
  const [postcode, setPostcode] = useState('');
  const [estimate, setEstimate] = useState<DeliveryEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setChecking] = useState(false);

  const check = async (event: React.FormEvent) => {
    event.preventDefault();
    setChecking(true);
    setError(null);
    try {
      const result = await estimateDelivery(postcode, { orderValue });
      setEstimate(result);
      // Fall back to standard when express is not serviceable on this route.
      const chosen = result.options.find((option) => option.id === speed);
      if (chosen && !chosen.available) onSpeedChange('standard');
    } catch (caught) {
      setEstimate(null);
      setError(
        caught instanceof PostcodeError
          ? caught.message
          : 'We could not check delivery for that postcode. Please try again.'
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <section
      style={{
        border: '1px solid var(--cw-border)',
        borderRadius: 'var(--cw-radius-control)',
        padding: '14px',
      }}
    >
      <h3
        style={{
          margin: '0 0 10px',
          fontFamily: 'var(--cw-font-body)',
          fontSize: 'var(--cw-fs-small)',
          fontWeight: 700,
          color: 'var(--cw-ink)',
        }}
      >
        Deliver To
      </h3>

      <form onSubmit={check} className="flex gap-2">
        <label htmlFor="cw-postcode" className="sr-only">
          Delivery PIN or ZIP code
        </label>
        <input
          suppressHydrationWarning
          id="cw-postcode"
          type="text"
          value={postcode}
          onChange={(event) => {
            setPostcode(event.target.value);
            setError(null);
          }}
          placeholder="Enter PIN / ZIP Code"
          autoComplete="postal-code"
          className="flex-1"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'cw-postcode-error' : undefined}
        />
        <button
          suppressHydrationWarning
          type="submit"
          className="cw-cta cw-cta--outline flex-shrink-0"
          disabled={isChecking || postcode.trim().length === 0}
        >
          {isChecking ? 'Checking…' : 'Check'}
        </button>
      </form>

      {error && (
        <p
          id="cw-postcode-error"
          role="alert"
          style={{
            margin: '8px 0 0',
            color: 'var(--cw-danger)',
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-micro)',
          }}
        >
          {error}
        </p>
      )}

      {estimate && (
        <div className="mt-3.5" aria-live="polite">
          <p
            style={{
              margin: '0 0 10px',
              color: 'var(--cw-ink-subtle)',
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-micro)',
            }}
          >
            {estimate.zoneLabel} · {estimate.postcode}
          </p>

          <div role="radiogroup" aria-label="Delivery speed" className="flex flex-col gap-2">
            {estimate.options.map((option) => {
              const isSelected = option.id === speed;
              return (
                <button
                  suppressHydrationWarning
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={!option.available}
                  onClick={() => onSpeedChange(option.id)}
                  className="flex items-start justify-between gap-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    padding: '11px 12px',
                    borderRadius: 'var(--cw-radius-control)',
                    border: `1px solid ${isSelected ? 'var(--cw-primary)' : 'var(--cw-border)'}`,
                    backgroundColor: isSelected ? 'var(--cw-primary-soft)' : 'var(--cw-white)',
                  }}
                >
                  <span>
                    <span
                      className="block"
                      style={{
                        fontFamily: 'var(--cw-font-body)',
                        fontSize: 'var(--cw-fs-small)',
                        fontWeight: 700,
                        color: 'var(--cw-ink)',
                      }}
                    >
                      {option.label}
                      {isSelected && <span className="sr-only"> (selected)</span>}
                    </span>
                    <span
                      className="mt-0.5 block"
                      style={{
                        fontFamily: 'var(--cw-font-body)',
                        fontSize: 'var(--cw-fs-micro)',
                        color: 'var(--cw-ink-subtle)',
                      }}
                    >
                      {option.available ? `Arrives ${formatDeliveryWindow(option)}` : option.note}
                    </span>
                    {option.available && option.note && (
                      <span
                        className="mt-0.5 block"
                        style={{
                          fontFamily: 'var(--cw-font-body)',
                          fontSize: 'var(--cw-fs-micro)',
                          color: 'var(--cw-success)',
                        }}
                      >
                        {option.note}
                      </span>
                    )}
                  </span>
                  <span
                    className="flex-shrink-0"
                    style={{
                      fontFamily: 'var(--cw-font-body)',
                      fontSize: 'var(--cw-fs-small)',
                      fontWeight: 700,
                      color: option.cost === 0 ? 'var(--cw-success)' : 'var(--cw-ink)',
                    }}
                  >
                    {option.cost === 0 ? 'Free' : formatCurrency(option.cost)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
