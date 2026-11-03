import type { LedgerEntryType, Prisma, SellerLedgerEntry } from '@prisma/client';
import { UNPAYABLE_STATUSES, payableWhere } from '@/utils/settlement';

/**
 * The money account between the platform and each seller.
 *
 * Every movement is one row, and the balance is their sum: positive means the
 * platform owes the shop. Before this there was no account, only flags on
 * sub-orders — so a return completed after a payout had nowhere to go but a
 * message asking an admin to "recover it manually", and nothing remembered.
 *
 *   SALE             + payoutAmount, once a sub-order clears the return window
 *   PAYOUT           − what was actually transferred, with the bank reference
 *   RETURN_REVERSAL  − payoutAmount, when a sale already credited is returned
 *   ADJUSTMENT       ± an admin correction, always with a note
 *
 * A reversal lands as a negative entry, so it comes off the next payout by
 * itself: the next settle pays the balance, and the balance already has it.
 *
 * SALE and RETURN_REVERSAL are idempotent per sub-order. The schema has no
 * unique index to lean on (one sub-order legitimately has both kinds), so each
 * write takes a per-shop transaction lock first and checks before inserting.
 * Every writer therefore needs a transaction client, never the bare client.
 */

type Tx = Prisma.TransactionClient;
/** Anything that can read: the bare client or a transaction. */
type Reader = Pick<Tx, 'sellerLedgerEntry'>;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The sign each entry type must carry, so a caller cannot credit a payout. */
export function signedAmount(type: LedgerEntryType, amount: number): number {
  const magnitude = round2(Math.abs(amount));
  if (type === 'SALE') return magnitude;
  if (type === 'PAYOUT' || type === 'RETURN_REVERSAL') return -magnitude;
  return round2(amount); // ADJUSTMENT keeps the sign it was given
}

/** Sum of entries in paise, so a long statement does not drift. */
export function sumAmounts(entries: { amount: number }[]): number {
  return entries.reduce((sum, entry) => sum + Math.round(entry.amount * 100), 0) / 100;
}

/**
 * Serialise one shop's own transaction against itself.
 *
 * Two admins settling at once, or a payout racing the SALE sync, would
 * otherwise both read the same balance. The lock is released when the
 * transaction ends. `$executeRaw` rather than `$queryRaw` because the function
 * returns `void`, which the query path cannot deserialise.
 */
export async function lockVendorLedger(tx: Tx, vendorId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ledger:${vendorId}`}))`;
}

interface SubOrderRef {
  id: string;
  vendorId: string | null;
  orderNumber: string;
  payoutAmount: number;
}

async function hasEntry(tx: Reader, sellerOrderId: string, type: LedgerEntryType): Promise<boolean> {
  const found = await tx.sellerLedgerEntry.findFirst({
    where: { sellerOrderId, type },
    select: { id: true },
  });
  return found !== null;
}

/**
 * Credit a shop for a sub-order that has cleared the return window.
 * Returns null when there is nothing to post: house stock, or already posted.
 */
export async function postSale(tx: Tx, sub: SubOrderRef): Promise<SellerLedgerEntry | null> {
  if (!sub.vendorId) return null;
  await lockVendorLedger(tx, sub.vendorId);
  if (await hasEntry(tx, sub.id, 'SALE')) return null;
  return tx.sellerLedgerEntry.create({
    data: {
      vendorId: sub.vendorId,
      sellerOrderId: sub.id,
      type: 'SALE',
      amount: signedAmount('SALE', sub.payoutAmount),
      note: `Order ${sub.orderNumber}`,
    },
  });
}

/**
 * Take back a sale that was returned.
 *
 * Only when the money was actually credited: a SALE entry exists for it, or it
 * was settled (sub-orders settled before the ledger existed have no SALE, but
 * the seller was still paid). A return inside the window never reached the
 * ledger, and reversing it would charge the shop for a sale it was never paid.
 */
export async function postReturnReversal(
  tx: Tx,
  sub: SubOrderRef & { settledAt: Date | null },
  createdBy?: string | null
): Promise<SellerLedgerEntry | null> {
  if (!sub.vendorId) return null;
  await lockVendorLedger(tx, sub.vendorId);
  if (await hasEntry(tx, sub.id, 'RETURN_REVERSAL')) return null;
  if (!sub.settledAt && !(await hasEntry(tx, sub.id, 'SALE'))) return null;
  return tx.sellerLedgerEntry.create({
    data: {
      vendorId: sub.vendorId,
      sellerOrderId: sub.id,
      type: 'RETURN_REVERSAL',
      amount: signedAmount('RETURN_REVERSAL', sub.payoutAmount),
      note: `Return on ${sub.orderNumber}`,
      createdBy: createdBy ?? null,
    },
  });
}

/** Record a transfer made to the shop. `amount` is the positive sum sent. */
export async function postPayout(
  tx: Tx,
  params: { vendorId: string; amount: number; reference?: string | null; createdBy?: string | null; note?: string | null }
): Promise<SellerLedgerEntry> {
  return tx.sellerLedgerEntry.create({
    data: {
      vendorId: params.vendorId,
      type: 'PAYOUT',
      amount: signedAmount('PAYOUT', params.amount),
      reference: params.reference ?? null,
      note: params.note ?? 'Bank transfer',
      createdBy: params.createdBy ?? null,
    },
  });
}

/** A manual correction, positive (owe the shop more) or negative. */
export async function postAdjustment(
  tx: Tx,
  params: { vendorId: string; amount: number; note: string; reference?: string | null; createdBy?: string | null }
): Promise<SellerLedgerEntry> {
  await lockVendorLedger(tx, params.vendorId);
  return tx.sellerLedgerEntry.create({
    data: {
      vendorId: params.vendorId,
      type: 'ADJUSTMENT',
      amount: signedAmount('ADJUSTMENT', params.amount),
      note: params.note,
      reference: params.reference ?? null,
      createdBy: params.createdBy ?? null,
    },
  });
}

/** What the platform owes the shop right now (negative: the shop owes back). */
export async function balance(db: Reader, vendorId: string): Promise<number> {
  const result = await db.sellerLedgerEntry.aggregate({
    where: { vendorId },
    _sum: { amount: true },
  });
  return round2(result._sum.amount ?? 0);
}

/** Every shop's balance at once, keyed by vendor id. Shops with no entries are absent. */
export async function balances(db: Reader): Promise<Map<string, number>> {
  const rows = await db.sellerLedgerEntry.groupBy({ by: ['vendorId'], _sum: { amount: true } });
  return new Map(rows.map((row) => [row.vendorId, round2(row._sum.amount ?? 0)]));
}

export interface StatementLine extends SellerLedgerEntry {
  /** Balance after this entry, oldest first. */
  balanceAfter: number;
}

export interface Statement {
  openingBalance: number;
  closingBalance: number;
  entries: StatementLine[];
}

/**
 * Entries for a shop over a range, oldest first, with a running balance.
 * `openingBalance` is everything before `from`, so a range still reads true.
 */
export async function statement(
  db: Reader,
  vendorId: string,
  range: { from?: Date | null; to?: Date | null } = {}
): Promise<Statement> {
  const createdAt: Prisma.DateTimeFilter = {};
  if (range.from) createdAt.gte = range.from;
  if (range.to) createdAt.lte = range.to;

  const [opening, rows] = await Promise.all([
    range.from
      ? db.sellerLedgerEntry.aggregate({
          where: { vendorId, createdAt: { lt: range.from } },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: 0 } }),
    db.sellerLedgerEntry.findMany({
      where: { vendorId, ...(range.from || range.to ? { createdAt } : {}) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 5000,
    }),
  ]);

  return withRunningBalance(round2(opening._sum.amount ?? 0), rows);
}

/** Pure: attach running balances. Exported for the tests. */
export function withRunningBalance(openingBalance: number, rows: SellerLedgerEntry[]): Statement {
  let runningPaise = Math.round(openingBalance * 100);
  const entries = rows.map((row) => {
    runningPaise += Math.round(row.amount * 100);
    return { ...row, balanceAfter: runningPaise / 100 };
  });
  return { openingBalance, closingBalance: runningPaise / 100, entries };
}

const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value);
  // Quote anything a spreadsheet could misread, and defuse formula injection.
  const safe = /^[=+\-@]/.test(text) && !/^-?\d/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Pure: a statement as CSV, one row per entry plus opening and closing lines. */
export function statementCsv(stmt: Statement, orderNumbers: Map<string, string> = new Map()): string {
  const header = ['Date', 'Type', 'Order', 'Reference', 'Note', 'Amount', 'Balance'];
  const lines = [header.join(',')];
  lines.push(['', 'OPENING', '', '', '', '', stmt.openingBalance.toFixed(2)].map(csvCell).join(','));
  for (const entry of stmt.entries) {
    lines.push(
      [
        entry.createdAt,
        entry.type,
        entry.sellerOrderId ? orderNumbers.get(entry.sellerOrderId) ?? entry.sellerOrderId : '',
        entry.reference,
        entry.note,
        entry.amount.toFixed(2),
        entry.balanceAfter.toFixed(2),
      ]
        .map(csvCell)
        .join(',')
    );
  }
  lines.push(['', 'CLOSING', '', '', '', '', stmt.closingBalance.toFixed(2)].map(csvCell).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Post SALE entries for every sub-order that has newly cleared the return
 * window. Run before any balance is shown or paid, so "due" is always current.
 *
 * Returns how many were posted.
 */
export async function syncSales(tx: Tx, vendorId?: string, now: Date = new Date()): Promise<number> {
  const eligible = await tx.sellerOrder.findMany({
    where: payableWhere(vendorId, now),
    select: { id: true, vendorId: true, orderNumber: true, payoutAmount: true },
  });
  if (eligible.length === 0) return 0;

  const posted = await tx.sellerLedgerEntry.findMany({
    where: { type: 'SALE', sellerOrderId: { in: eligible.map((sub) => sub.id) } },
    select: { sellerOrderId: true },
  });
  const done = new Set(posted.map((row) => row.sellerOrderId));

  let count = 0;
  for (const sub of eligible) {
    if (done.has(sub.id)) continue;
    if (await postSale(tx, sub)) count += 1;
  }
  return count;
}

/**
 * Stamp `settledAt` on the sub-orders a payout covered: credited by a SALE,
 * not yet settled, and not since cancelled or returned (those are netted out by
 * their reversal and stay unsettled).
 */
export async function markCreditedSettled(tx: Tx, vendorId: string, settledAt: Date): Promise<number> {
  const open = await tx.sellerOrder.findMany({
    where: { vendorId, settledAt: null, status: { notIn: [...UNPAYABLE_STATUSES] } },
    select: { id: true },
  });
  if (open.length === 0) return 0;
  const credited = await tx.sellerLedgerEntry.findMany({
    where: { type: 'SALE', sellerOrderId: { in: open.map((sub) => sub.id) } },
    select: { sellerOrderId: true },
  });
  const ids = credited.map((row) => row.sellerOrderId!);
  if (ids.length === 0) return 0;
  const result = await tx.sellerOrder.updateMany({
    // `settledAt: null` again: another settlement may have claimed them since.
    where: { id: { in: ids }, settledAt: null },
    data: { settledAt },
  });
  return result.count;
}
