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
    <section className="cw-field">
      <h2>Deliver to</h2>

      <form onSubmit={check} className="cw-ship-form">
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
          placeholder="Enter PIN / ZIP code"
          autoComplete="postal-code"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'cw-postcode-error' : undefined}
        />
        <button
          suppressHydrationWarning
          type="submit"
          className="cw-cta cw-cta--outline"
          disabled={isChecking || postcode.trim().length === 0}
        >
          {isChecking ? 'Checking…' : 'Check'}
        </button>
      </form>

      {error && (
        <p id="cw-postcode-error" role="alert" className="cw-ship-error">
          {error}
        </p>
      )}

      {estimate && (
        <div className="cw-ship-result" aria-live="polite">
          <p className="cw-ship-zone">
            {estimate.zoneLabel} · {estimate.postcode}
          </p>

          <div role="radiogroup" aria-label="Delivery speed" className="cw-ship-options">
            {estimate.options.map((option) => (
              <button
                suppressHydrationWarning
                key={option.id}
                type="button"
                role="radio"
                aria-checked={option.id === speed}
                disabled={!option.available}
                onClick={() => onSpeedChange(option.id)}
                className="cw-ship-option"
                data-active={option.id === speed ? 'true' : undefined}
              >
                <span className="cw-ship-option-text">
                  <span className="cw-ship-option-label">{option.label}</span>
                  <span className="cw-ship-option-when">
                    {option.available ? `Arrives ${formatDeliveryWindow(option)}` : option.note}
                  </span>
                  {option.available && option.note && (
                    <span className="cw-ship-option-note">{option.note}</span>
                  )}
                </span>
                <span className="cw-ship-option-cost" data-free={option.cost === 0 || undefined}>
                  {option.cost === 0 ? 'Free' : formatCurrency(option.cost)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
