'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Button, Modal } from '@/components/common';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { Order } from '@/types';

export interface ReturnRequestModalProps {
  order: Order;
  /** Called after a return is raised so the list can refresh its state. */
  onRequested?: () => void;
}

/**
 * The reasons the return policy actually accepts. Free text is still collected
 * underneath, but a fixed list is what makes the admin queue sortable — and it
 * keeps the shopper from writing a reason the policy has no answer for.
 */
const REASONS = [
  'Damaged or defective on arrival',
  'Wrong item, colour or size delivered',
  'Different from the description or photographs',
  'Size or fit is not right',
  'Changed my mind',
  'Other',
];

export const ReturnRequestModal: React.FC<ReturnRequestModalProps> = ({ order, onRequested }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [requestType, setRequestType] = useState<'RETURN' | 'EXCHANGE'>('RETURN');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await apiClient.patch(`/orders/${order.id}/return`, {
        reason,
        requestType,
        description: description.trim() || undefined,
      });
      toast.success(
        requestType === 'EXCHANGE'
          ? 'Exchange requested — we will be in touch within a working day.'
          : 'Return requested — we will be in touch within a working day.'
      );
      setIsOpen(false);
      setDescription('');
      onRequested?.();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not raise that return.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
        Return or exchange
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={`Return or exchange ${order.orderNumber}`}
        size="md"
      >
        <form onSubmit={submit}>
          <p className="m-0 text-[13.5px]" style={{ color: 'var(--ink-2)', lineHeight: 1.65 }}>
            Returns are accepted within 7 days of delivery on unused items with their original tags
            and packaging. Customized and made-to-order pieces cannot be returned &mdash; the{' '}
            <Link href="/return-policy" className="underline underline-offset-2 hover:text-ink">
              return policy
            </Link>{' '}
            has the detail.
          </p>

          <fieldset className="mt-5">
            <legend className="block text-sm font-medium text-black">What would you like? *</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(
                [
                  ['RETURN', 'Refund', 'Send it back for your money'],
                  ['EXCHANGE', 'Exchange', 'Swap for another size or colour'],
                ] as const
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className="flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-sm"
                  style={{
                    borderColor: requestType === value ? 'var(--brand)' : 'var(--border)',
                    background: requestType === value ? 'var(--brand-soft)' : 'transparent',
                  }}
                >
                  <span className="flex items-center gap-2 font-medium text-black">
                    <input
                      type="radio"
                      name="request-type"
                      value={value}
                      checked={requestType === value}
                      onChange={() => setRequestType(value)}
                    />
                    {label}
                  </span>
                  <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                    {hint}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label htmlFor="return-reason" className="mt-5 block text-sm font-medium text-black">
            Reason *
          </label>
          <select
            id="return-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-black focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            {REASONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <label htmlFor="return-detail" className="mt-4 block text-sm font-medium text-black">
            Anything else we should know?
          </label>
          <textarea
            id="return-detail"
            rows={4}
            maxLength={2000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Which item, and what went wrong"
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-black placeholder-neutral-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />

          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="submit" loading={isSubmitting}>
              Request return
            </Button>
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};
