'use client';

import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { formatCurrency } from '@/utils/helpers';

const STORAGE_KEY = 'ci:coupon-code';

export interface AppliedCoupon {
  code: string;
  discount: number;
}

export interface CouponFieldProps {
  /** Cart subtotal the discount is calculated against. */
  subtotal: number;
  /** Fired with the applied coupon, or null when it is cleared or invalidated. */
  onChange: (applied: AppliedCoupon | null) => void;
  className?: string;
}

/** Only the code is persisted — the rupee value is re-derived from the live
 *  subtotal, so an edited cart can never carry a stale discount to checkout. */
const readStoredCode = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
};

/** The stored code never changes without this component doing it. */
const subscribeToStorage = () => () => {};

const writeStoredCode = (code: string | null): void => {
  if (typeof window === 'undefined') return;
  try {
    if (code) window.sessionStorage.setItem(STORAGE_KEY, code);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private-mode storage refusal is not worth failing a checkout over; the
    // code just will not carry from the cart to the checkout page.
  }
};

/**
 * Apply a discount code.
 *
 * Validation is server-side (`POST /api/coupons/apply`), which shares its
 * arithmetic with order placement — so the discount quoted here is the
 * discount actually charged. The checkout used to hardcode one code in the
 * browser, which meant every real coupon an admin created was unusable and the
 * hardcoded one applied whether or not it existed.
 */
export const CouponField: React.FC<CouponFieldProps> = ({ subtotal, onChange, className = '' }) => {
  /**
   * The code carried over from the cart. Read through the store rather than
   * assigned from an effect: the server has no session storage, so seeding the
   * input after mount would rewrite it a frame after paint.
   */
  const storedCode = useSyncExternalStore(subscribeToStorage, readStoredCode, () => '');
  // Null until the shopper types; the stored code shows through until then.
  const [typedCode, setTypedCode] = useState<string | null>(null);
  const code = typedCode ?? storedCode;
  const [applied, setApplied] = useState<AppliedCoupon | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  // Both call sites pass a `useCallback`-stable handler, so depending on it
  // directly is cheap and keeps the closure current.
  const validate = useCallback(
    async (candidate: string, { silent = false }: { silent?: boolean } = {}) => {
      const trimmed = candidate.trim();
      if (!trimmed) return;

      if (!silent) {
        setIsChecking(true);
        setError(null);
      }
      try {
        const res = await apiClient.post('/coupons/apply', { code: trimmed, subtotal });
        const coupon = res.data?.data?.coupon;
        const next = { code: coupon.code as string, discount: Number(coupon.discount) || 0 };
        setApplied(next);
        setTypedCode(next.code);
        setError(null);
        writeStoredCode(next.code);
        onChange(next);
      } catch (err) {
        setApplied(null);
        writeStoredCode(null);
        onChange(null);
        // A code restored from a previous page fails quietly — the cart may
        // simply have dropped below its minimum, and an error the shopper did
        // not just trigger reads as a bug.
        if (!silent) setError(getApiErrorMessage(err, 'That code could not be applied.'));
      } finally {
        if (!silent) setIsChecking(false);
      }
    },
    [subtotal, onChange]
  );

  // Re-check a code carried over from the cart against this page's subtotal.
  // Only the request is fired here — the input already shows `storedCode`.
  useEffect(() => {
    if (storedCode && subtotal > 0) {
      // `set-state-in-effect` is disabled rather than worked around: it sees
      // that `validate` writes state and cannot see that the silent path
      // writes none of it synchronously — everything before the first `await`
      // is guarded by `if (!silent)`. Deferring the call through a microtask
      // would satisfy the rule without changing what runs.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void validate(storedCode, { silent: true });
    }
    // Deliberately mount-only: `validate` closes over the subtotal at mount,
    // and re-running on every quantity change would spam the endpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = () => {
    setApplied(null);
    setTypedCode('');
    setError(null);
    writeStoredCode(null);
    onChange(null);
  };

  if (applied) {
    return (
      <div className={`border border-line bg-surface-2 px-4 py-3 ${className}`.trim()}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="m-0 text-[13px] font-semibold text-ink">{applied.code} applied</p>
            <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
              You save {formatCurrency(applied.discount)}
            </p>
          </div>
          <button
            type="button"
            onClick={remove}
            className="text-[12px] underline underline-offset-2 hover:text-ink"
            style={{ color: 'var(--ink-3)' }}
          >
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <label
        htmlFor="coupon-code"
        className="m-0 block text-[10.5px] font-bold uppercase tracking-[0.12em]"
        style={{ color: 'var(--ink-3)' }}
      >
        Discount code
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="coupon-code"
          type="text"
          value={code}
          onChange={(event) => setTypedCode(event.target.value.toUpperCase())}
          onKeyDown={(event) => {
            // The field sits inside the checkout form; Enter here means
            // "apply this code", not "place the order".
            if (event.key === 'Enter') {
              event.preventDefault();
              void validate(code);
            }
          }}
          placeholder="Enter code"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 border border-line bg-white px-3 text-[14px] uppercase text-ink placeholder-neutral-400 focus:border-[var(--ink-3)] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void validate(code)}
          disabled={isChecking || !code.trim()}
          className="btn btn-outline"
        >
          {isChecking ? 'Checking…' : 'Apply'}
        </button>
      </div>
      {error && (
        <p className="m-0 mt-2 text-[13px]" style={{ color: 'var(--sale)' }}>
          {error}
        </p>
      )}
    </div>
  );
};
