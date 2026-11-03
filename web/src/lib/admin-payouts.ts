'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * What the marketplace owes its sellers.
 *
 * Two figures per shop throughout: "due" has cleared the buyer's return window
 * and can be paid today, "held" is earned but still in fulfilment or still
 * returnable. They are never added together — paying held money is how you end
 * up chasing a seller for a refund on a parcel that came back.
 */

export interface PayoutRow {
  id: string;
  shopName: string;
  shopSlug: string;
  isVerified: boolean;
  isActive: boolean;
  /** Null when the shop pays its categories' rates rather than its own. */
  commissionRate: number | null;
  kycStatus: 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  bankAccountName: string | null;
  bankIFSC: string | null;
  bankName: string | null;
  /** The full account number is never sent to the browser. */
  bankAccountLast4: string | null;
  /** False when the shop has not given bank details to pay into. */
  canBePaid: boolean;
  /**
   * The shop's ledger balance, signed. Negative means returns reversed after
   * a payout exceed what has been earned since — it comes off future sales.
   */
  ledgerBalance: number;
  /** What a settle pays now: the balance, never below zero. */
  payoutDue: number;
  ordersDue: number;
  commissionEarned: number;
  payoutHeld: number;
  ordersHeld: number;
  payoutSettled: number;
}

export interface PayoutOrderRow {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  commissionRate: number;
  commissionAmount: number;
  payoutAmount: number;
  deliveredAt: string | null;
  settledAt: string | null;
  createdAt: string;
  /** Null when payable; otherwise the reason it is being held. */
  hold: string | null;
}

export interface WithdrawalRow {
  id: string;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  transactionId: string | null;
  rejectionReason: string | null;
  completedAt: string | null;
  createdAt: string;
  vendor: { id: string; shopName: string; shopSlug: string } | null;
}

export type LedgerEntryType = 'SALE' | 'PAYOUT' | 'RETURN_REVERSAL' | 'ADJUSTMENT';

export interface LedgerEntryRow {
  id: string;
  type: LedgerEntryType;
  /** Rupees, signed: SALE positive; PAYOUT and RETURN_REVERSAL negative. */
  amount: number;
  balanceAfter: number;
  sellerOrderId: string | null;
  orderNumber: string | null;
  reference: string | null;
  note: string | null;
  createdAt: string;
}

export interface LedgerStatement {
  openingBalance: number;
  closingBalance: number;
  entries: LedgerEntryRow[];
}

export const LEDGER_TYPE_LABEL: Record<LedgerEntryType, string> = {
  SALE: 'Sale',
  PAYOUT: 'Payout',
  RETURN_REVERSAL: 'Return reversal',
  ADJUSTMENT: 'Adjustment',
};

export async function getPayouts(): Promise<PayoutRow[]> {
  try {
    const response = await apiClient.get('/admin/payouts');
    return response.data?.data?.payouts ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load payouts.'));
  }
}

export async function getPayoutOrders(vendorId: string): Promise<PayoutOrderRow[]> {
  try {
    const response = await apiClient.get(`/admin/payouts/${encodeURIComponent(vendorId)}`);
    return response.data?.data?.orders ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load that seller’s orders.'));
  }
}

export async function getStatement(
  vendorId: string,
  range: { from?: string; to?: string } = {}
): Promise<LedgerStatement> {
  try {
    const response = await apiClient.get(
      `/admin/payouts/${encodeURIComponent(vendorId)}/statement`,
      { params: range }
    );
    const data = response.data?.data ?? {};
    return {
      openingBalance: data.openingBalance ?? 0,
      closingBalance: data.closingBalance ?? 0,
      entries: data.entries ?? [],
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load that statement.'));
  }
}

/** Download a shop's statement as CSV, through the authenticated client. */
export async function downloadStatementCsv(
  vendorId: string,
  shopSlug: string,
  range: { from?: string; to?: string } = {}
): Promise<void> {
  try {
    const response = await apiClient.get(
      `/admin/payouts/${encodeURIComponent(vendorId)}/statement`,
      { params: { ...range, format: 'csv' }, responseType: 'blob' }
    );
    const url = URL.createObjectURL(response.data as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `statement-${shopSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not export that statement.'));
  }
}

/**
 * A manual ledger correction. Positive credits the shop, negative debits it;
 * the note is required and the seller sees it on their statement.
 */
export async function postLedgerAdjustment(
  vendorId: string,
  input: { amount: number; note: string; reference?: string }
): Promise<string> {
  try {
    const response = await apiClient.post(
      `/admin/payouts/${encodeURIComponent(vendorId)}/adjustments`,
      input
    );
    return response.data?.message ?? 'Adjustment recorded.';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not record that adjustment.'));
  }
}

/**
 * Record that a shop has been paid.
 *
 * The amount is decided server-side — the shop's ledger balance — and this
 * sends only the bank reference, so the screen cannot settle a figure other
 * than the one the ledger holds.
 */
export async function settlePayout(vendorId: string, transactionId?: string): Promise<string> {
  try {
    const response = await apiClient.post(
      `/admin/payouts/${encodeURIComponent(vendorId)}/settle`,
      transactionId ? { transactionId } : {}
    );
    return response.data?.message ?? 'Payout settled.';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not settle that payout.'));
  }
}

/**
 * Decline a payout request.
 *
 * Nothing is un-earned by this — the sub-orders stay payable and can be settled
 * later. It exists so a request an admin will not pay does not sit open forever,
 * blocking the seller from asking again.
 */
export async function rejectWithdrawal(id: string, rejectionReason: string): Promise<string> {
  try {
    const response = await apiClient.patch(`/admin/withdrawals/${encodeURIComponent(id)}`, {
      rejectionReason,
    });
    return response.data?.message ?? 'Request declined.';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not decline that request.'));
  }
}

export async function getWithdrawals(): Promise<WithdrawalRow[]> {
  try {
    const response = await apiClient.get('/admin/withdrawals');
    return response.data?.data?.withdrawals ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load payout history.'));
  }
}
