'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { downloadFromApi } from '@/lib/admin-download';
import type { Page } from '@/lib/api/types';

/**
 * What the marketplace owes its sellers (FINANCE).
 *
 * Two figures per shop throughout: the ledger *balance* can be paid today; the
 * *held* amount is earned but still undelivered or inside the buyer's return
 * window. They are never added together — paying held money is how you end up
 * chasing a seller for a refund on a parcel that came back. All amounts are
 * integer paise; a negative balance means returns reversed after a payout
 * exceed what has been earned since.
 */

export interface SellerBalance {
  sellerId: string;
  shopName: string;
  balancePaise: number;
  heldPaise: number;
  lastPayoutAt: string | null;
}

export interface HeldOrder {
  sellerOrderId: string;
  orderNumber: string;
  payoutPaise: number;
  /** Why it is not payable yet ("Not delivered yet", "Return window open until …"). */
  reason: string;
}

export type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';

export interface Withdrawal {
  id: string;
  sellerId: string;
  shopName: string | null;
  amountPaise: number;
  status: WithdrawalStatus;
  transactionRef: string | null;
  rejectionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
  completedAt: string | null;
}

export interface SellerEarnings {
  balancePaise: number;
  heldPaise: number;
  held: HeldOrder[];
  lifetimeSalesPaise: number;
  lifetimePayoutsPaise: number;
  openWithdrawal: Withdrawal | null;
}

export type LedgerEntryType = 'SALE' | 'PAYOUT' | 'RETURN_REVERSAL' | 'ADJUSTMENT';

export interface StatementLine {
  entry: {
    id: string;
    createdAt: string;
    type: LedgerEntryType;
    orderNumber: string | null;
    reference: string | null;
    note: string | null;
    /** Signed: SALE positive; PAYOUT and RETURN_REVERSAL negative. */
    amountPaise: number;
  };
  balanceAfterPaise: number;
}

export interface LedgerStatement {
  openingPaise: number;
  closingPaise: number;
  lines: StatementLine[];
}

export const LEDGER_TYPE_LABEL: Record<LedgerEntryType, string> = {
  SALE: 'Sale',
  PAYOUT: 'Payout',
  RETURN_REVERSAL: 'Return reversal',
  ADJUSTMENT: 'Adjustment',
};

/** `YYYY-MM-DD` (a day in the reader's calendar) → the instant the API filters on. */
const dayStart = (day?: string) => (day ? new Date(`${day}T00:00:00`).toISOString() : undefined);
const dayEnd = (day?: string) => (day ? new Date(`${day}T23:59:59.999`).toISOString() : undefined);

/** Every approved or suspended marketplace shop's balance (the house shop is never paid out). */
export async function getBalances(page = 1, limit = 100): Promise<Page<SellerBalance>> {
  try {
    const response = await apiClient.get('/admin/payouts', { params: { page, limit } });
    return response.data?.data as Page<SellerBalance>;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load payouts.'));
  }
}

export async function getSellerEarnings(sellerId: string): Promise<SellerEarnings> {
  try {
    const response = await apiClient.get(`/admin/payouts/${encodeURIComponent(sellerId)}`);
    const data = response.data?.data as SellerEarnings;
    return { ...data, held: data?.held ?? [] };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load that shop’s earnings.'));
  }
}

export async function getStatement(
  sellerId: string,
  range: { from?: string; to?: string } = {}
): Promise<LedgerStatement> {
  try {
    const params = { from: dayStart(range.from), to: dayEnd(range.to) };
    const response = await apiClient.get(
      `/admin/payouts/${encodeURIComponent(sellerId)}/statement`,
      { params }
    );
    const data = response.data?.data ?? {};
    return {
      openingPaise: data.openingPaise ?? 0,
      closingPaise: data.closingPaise ?? 0,
      lines: data.lines ?? [],
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load that statement.'));
  }
}

/** A shop's statement as CSV, for the same range. */
export async function downloadStatementCsv(
  sellerId: string,
  shopName: string,
  range: { from?: string; to?: string } = {}
): Promise<void> {
  const slug =
    shopName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'shop';
  await downloadFromApi(
    `/admin/payouts/${encodeURIComponent(sellerId)}/statement`,
    `statement-${slug}-${new Date().toISOString().slice(0, 10)}.csv`,
    { from: dayStart(range.from), to: dayEnd(range.to), format: 'csv' }
  );
}

/**
 * A manual ledger correction. Positive credits the shop, negative debits it;
 * the note is required and the seller sees it on their statement.
 */
export async function postLedgerAdjustment(
  sellerId: string,
  input: { amountPaise: number; note: string; reference?: string }
): Promise<string> {
  try {
    const response = await apiClient.post(
      `/admin/payouts/${encodeURIComponent(sellerId)}/adjustments`,
      input
    );
    return response.data?.message ?? 'Adjustment recorded.';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not record that adjustment.'));
  }
}

/**
 * Record that a shop has been paid by bank transfer. The UTR reference is
 * required. Leave `amountPaise` out to pay the whole balance; the API refuses
 * anything above it.
 */
export async function settlePayout(
  sellerId: string,
  input: { reference: string; amountPaise?: number; note?: string }
): Promise<string> {
  try {
    const response = await apiClient.post(
      `/admin/payouts/${encodeURIComponent(sellerId)}/settle`,
      input
    );
    return response.data?.message ?? 'Payout recorded.';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not record that payout.'));
  }
}

export async function getWithdrawals(
  status?: WithdrawalStatus | '',
  page = 1,
  limit = 50
): Promise<Page<Withdrawal>> {
  try {
    const response = await apiClient.get('/admin/withdrawals', {
      params: { page, limit, ...(status ? { status } : {}) },
    });
    return response.data?.data as Page<Withdrawal>;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load payout requests.'));
  }
}

/**
 * Decide a seller's payout request. APPROVED acknowledges it; COMPLETED records
 * the bank transfer (UTR in `transactionRef`) and settles that amount from the
 * shop's ledger; REJECTED needs a reason the seller will read and leaves the
 * money payable.
 */
export async function decideWithdrawal(
  id: string,
  input: {
    status: 'APPROVED' | 'REJECTED' | 'COMPLETED';
    transactionRef?: string;
    rejectionReason?: string;
  }
): Promise<string> {
  try {
    const response = await apiClient.patch(`/admin/withdrawals/${encodeURIComponent(id)}`, input);
    return response.data?.message ?? 'Request updated.';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not update that request.'));
  }
}
