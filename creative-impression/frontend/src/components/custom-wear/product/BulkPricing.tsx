'use client';

import React from 'react';
import { formatCurrency } from '@/utils/helpers';
import { formatTierRange } from '@/lib/custom-wear/pricing';
import type { PriceTier, QuantityPricing } from '@/types/custom-wear';

export interface BulkPricingProps {
  tiers: PriceTier[];
  pricing: QuantityPricing;
  onSelectTier?: (tier: PriceTier) => void;
}

/**
 * Volume price table. The active tier is highlighted and the next one shows
 * what the buyer would save by moving up — the single most useful nudge on a
 * bulk apparel page.
 */
export const BulkPricing: React.FC<BulkPricingProps> = ({ tiers, pricing, onSelectTier }) => {
  if (tiers.length <= 1) return null;

  return (
    <section>
      <h3
        style={{
          margin: '0 0 10px',
          fontFamily: 'var(--cw-font-body)',
          fontSize: 'var(--cw-fs-small)',
          fontWeight: 700,
          color: 'var(--cw-ink)',
        }}
      >
        Volume Pricing
      </h3>

      <table
        className="w-full border-collapse text-left"
        style={{ fontFamily: 'var(--cw-font-body)', fontSize: 'var(--cw-fs-micro)' }}
      >
        <caption className="sr-only">Price per unit by order quantity</caption>
        <thead>
          <tr style={{ color: 'var(--cw-ink-subtle)' }}>
            <th scope="col" className="py-1.5 font-semibold">
              Quantity
            </th>
            <th scope="col" className="py-1.5 text-right font-semibold">
              Price per unit
            </th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier) => {
            const isActive = pricing.tier?.minQty === tier.minQty;
            const cells = (
              <>
                <td
                  className="py-2"
                  style={{
                    color: isActive ? 'var(--cw-ink)' : 'var(--cw-ink-muted)',
                    fontWeight: isActive ? 700 : 400,
                    paddingLeft: isActive ? '8px' : 0,
                  }}
                >
                  {formatTierRange(tier)}
                  {isActive && <span className="sr-only"> (your current quantity)</span>}
                </td>
                <td
                  className="py-2 text-right"
                  style={{
                    color: isActive ? 'var(--cw-ink)' : 'var(--cw-ink-muted)',
                    fontWeight: isActive ? 700 : 500,
                    paddingRight: isActive ? '8px' : 0,
                  }}
                >
                  {formatCurrency(tier.pricePerUnit)}
                </td>
              </>
            );

            return (
              <tr
                key={`${tier.minQty}-${tier.maxQty ?? 'plus'}`}
                style={{
                  borderTop: '1px solid var(--cw-border)',
                  backgroundColor: isActive ? 'var(--cw-primary-soft)' : 'transparent',
                  cursor: onSelectTier ? 'pointer' : 'default',
                }}
                onClick={onSelectTier ? () => onSelectTier(tier) : undefined}
              >
                {cells}
              </tr>
            );
          })}
        </tbody>
      </table>

      {pricing.nextTier && (
        <p
          style={{
            margin: '10px 0 0',
            color: 'var(--cw-ink-muted)',
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-micro)',
          }}
        >
          Add {pricing.nextTier.minQty - pricing.quantity} more to reach{' '}
          <strong style={{ color: 'var(--cw-ink)' }}>
            {formatCurrency(pricing.nextTier.pricePerUnit)}
          </strong>{' '}
          per unit.
        </p>
      )}
    </section>
  );
};
