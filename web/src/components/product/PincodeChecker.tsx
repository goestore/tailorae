'use client';

import React, { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

interface EtaResult {
  pincode: string;
  serviceable: boolean;
  city?: string;
  state?: string;
  cod?: boolean;
  minDays?: number;
  maxDays?: number;
  earliest?: string;
  latest?: string;
  source?: string;
}

/**
 * Delivery check on the product page.
 *
 * The backend answers with a `source` of `estimate` while there is no courier
 * account wired up, and this says so in the copy rather than presenting a
 * heuristic as a promise. When a real quote replaces it, the wording follows
 * automatically.
 */
export const PincodeChecker: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [pincode, setPincode] = useState('');
  const [result, setResult] = useState<EtaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const check = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = pincode.trim();
    if (!/^\d{6}$/.test(value)) {
      setResult(null);
      setError('Enter a 6-digit pincode.');
      return;
    }

    setIsChecking(true);
    setError(null);
    try {
      const res = await apiClient.post('/delivery/eta', { pincode: value });
      setResult(res.data?.data ?? null);
    } catch (err) {
      setResult(null);
      setError(getApiErrorMessage(err, 'Could not check that pincode right now.'));
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className={className}>
      <p
        className="m-0 text-[10.5px] font-bold uppercase leading-none tracking-[0.12em]"
        style={{ color: 'var(--ink-3)' }}
      >
        Delivery
      </p>

      <form onSubmit={check} className="mt-3 flex gap-2">
        <label htmlFor="delivery-pincode" className="sr-only">
          Delivery pincode
        </label>
        <input
          id="delivery-pincode"
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          value={pincode}
          onChange={(event) => setPincode(event.target.value.replace(/\D/g, ''))}
          placeholder="Enter pincode"
          className="h-11 min-w-0 flex-1 border border-line bg-white px-3 text-[14px] text-ink placeholder-neutral-400 focus:border-[var(--ink-3)] focus:outline-none"
        />
        <button type="submit" className="btn btn-outline" disabled={isChecking}>
          {isChecking ? 'Checking…' : 'Check'}
        </button>
      </form>

      {error && (
        <p className="m-0 mt-2 text-[13px]" style={{ color: 'var(--sale)' }}>
          {error}
        </p>
      )}

      {result && !error && (
        <div className="mt-3 border border-line bg-surface-2 px-3.5 py-3 text-[13px]">
          {result.serviceable ? (
            <>
              <p className="m-0 font-semibold text-ink">
                Delivers by {result.latest}
                {result.earliest && result.earliest !== result.latest ? (
                  <span style={{ fontWeight: 400, color: 'var(--ink-2)' }}>
                    {' '}
                    (as early as {result.earliest})
                  </span>
                ) : null}
              </p>
              <p className="m-0 mt-1" style={{ color: 'var(--ink-3)' }}>
                {[result.city, result.state].filter(Boolean).join(', ') || `Pincode ${result.pincode}`}
                {' · '}
                {result.cod ? 'Cash on delivery available' : 'Prepaid orders only'}
              </p>
              {result.source === 'estimate' && (
                <p className="m-0 mt-1.5 text-[12px]" style={{ color: 'var(--ink-3)' }}>
                  Estimated from your region. The exact date is confirmed when the parcel is picked
                  up.
                </p>
              )}
            </>
          ) : (
            <p className="m-0 font-semibold" style={{ color: 'var(--sale)' }}>
              We do not deliver to {result.pincode} yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
