'use client';

import React from 'react';
import { Address } from '@/types';

export interface AddressPickerProps {
  addresses: Address[];
  /** The chosen address, or `null` for "use a new address". */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/**
 * The saved addresses a returning customer can ship to.
 *
 * Purely presentational: checkout owns the selection and copies the chosen
 * address into the one shipping form it submits, so there is a single place
 * where the order payload is built regardless of which route the shopper took
 * to fill it in.
 *
 * The radios carry `rounded-full` because the site-wide control radius is 0 —
 * right for inputs and buttons, but it turns a radio into something that reads
 * as a checkbox, which is the wrong promise for a one-of-many choice.
 */
export const AddressPicker: React.FC<AddressPickerProps> = ({
  addresses,
  selectedId,
  onSelect,
}) => (
  <fieldset className="m-0 border-0 p-0">
    <legend
      className="mb-3 p-0 text-[10.5px] font-bold uppercase tracking-[0.12em]"
      style={{ color: 'var(--ink-3)' }}
    >
      Deliver to
    </legend>

    <div className="flex flex-col gap-2">
      {addresses.map((address) => {
        const isSelected = selectedId === address.id;
        return (
          <label
            key={address.id}
            className="flex cursor-pointer items-start gap-3 border p-4 transition-colors"
            style={{
              borderColor: isSelected ? 'var(--ink)' : 'var(--border)',
              background: isSelected ? 'var(--surface-2)' : 'var(--surface)',
            }}
          >
            <input
              type="radio"
              name="saved-address"
              className="mt-1 flex-shrink-0 rounded-full"
              checked={isSelected}
              onChange={() => onSelect(address.id)}
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="text-[14.5px] font-semibold text-ink">{address.fullName}</span>
                <span
                  className="text-[10.5px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: 'var(--ink-3)' }}
                >
                  {address.type}
                </span>
                {address.isDefault && (
                  <span
                    className="text-[10.5px] font-bold uppercase tracking-[0.1em]"
                    style={{ color: 'var(--brand-700)' }}
                  >
                    Default
                  </span>
                )}
              </span>
              <span
                className="mt-1 block text-[13.5px]"
                style={{ color: 'var(--ink-2)', lineHeight: 1.6 }}
              >
                {address.addressLine1}
                {address.addressLine2 ? `, ${address.addressLine2}` : ''}
                <br />
                {address.city}, {address.state} {address.postalCode}, {address.country}
                <br />
                {address.phoneNumber}
              </span>
            </span>
          </label>
        );
      })}

      <label
        className="flex cursor-pointer items-center gap-3 border p-4 transition-colors"
        style={{
          borderColor: selectedId === null ? 'var(--ink)' : 'var(--border)',
          background: selectedId === null ? 'var(--surface-2)' : 'var(--surface)',
        }}
      >
        <input
          type="radio"
          name="saved-address"
          className="flex-shrink-0 rounded-full"
          checked={selectedId === null}
          onChange={() => onSelect(null)}
        />
        <span className="text-[14.5px] text-ink">Use a new address</span>
      </label>
    </div>
  </fieldset>
);
