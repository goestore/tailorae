import type { Prisma, SellerLedgerEntry } from '@prisma/client';
import {
  postAdjustment,
  postPayout,
  postReturnReversal,
  postSale,
  signedAmount,
  statementCsv,
  sumAmounts,
  withRunningBalance,
} from '@/utils/ledger';

/**
 * The seller account. What matters: signs cannot be got wrong by a caller,
 * a sale or a reversal is never posted twice, and a return only claws back
 * money that was actually credited.
 */

const entry = (overrides: Partial<SellerLedgerEntry>): SellerLedgerEntry => ({
  id: 'e',
  vendorId: 'shop-a',
  sellerOrderId: null,
  type: 'SALE',
  amount: 0,
  reference: null,
  note: null,
  createdBy: null,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  ...overrides,
});

/** A stand-in transaction holding only ledger rows. */
const fakeTx = () => {
  const rows: SellerLedgerEntry[] = [];
  const tx = {
    $executeRaw: async () => 0,
    sellerLedgerEntry: {
      findFirst: async ({ where }: { where: { sellerOrderId: string; type: string } }) =>
        rows.find((row) => row.sellerOrderId === where.sellerOrderId && row.type === where.type) ??
        null,
      create: async ({ data }: { data: Partial<SellerLedgerEntry> }) => {
        const row = entry({ ...data, id: `e${rows.length + 1}` });
        rows.push(row);
        return row;
      },
    },
  };
  return { rows, tx: tx as unknown as Prisma.TransactionClient };
};

const sub = { id: 'sub-1', vendorId: 'shop-a', orderNumber: 'CI-1-A', payoutAmount: 850 };

describe('signedAmount', () => {
  it('forces each type to its sign whatever the caller passed', () => {
    expect(signedAmount('SALE', -100)).toBe(100);
    expect(signedAmount('PAYOUT', 100)).toBe(-100);
    expect(signedAmount('RETURN_REVERSAL', 99.999)).toBe(-100);
    expect(signedAmount('ADJUSTMENT', -25.5)).toBe(-25.5);
    expect(signedAmount('ADJUSTMENT', 25.5)).toBe(25.5);
  });
});

describe('sumAmounts', () => {
  it('adds in paise so floating point does not drift', () => {
    expect(sumAmounts([{ amount: 0.1 }, { amount: 0.2 }, { amount: -0.3 }])).toBe(0);
  });
});

describe('postSale', () => {
  it('posts the payout amount as a credit, once', async () => {
    const { rows, tx } = fakeTx();
    expect(await postSale(tx, sub)).not.toBeNull();
    expect(await postSale(tx, sub)).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'SALE', amount: 850, sellerOrderId: 'sub-1' });
  });

  it('posts nothing for house stock', async () => {
    const { rows, tx } = fakeTx();
    expect(await postSale(tx, { ...sub, vendorId: null })).toBeNull();
    expect(rows).toHaveLength(0);
  });
});

describe('postReturnReversal', () => {
  it('reverses a credited sale, once', async () => {
    const { rows, tx } = fakeTx();
    await postSale(tx, sub);
    await postReturnReversal(tx, { ...sub, settledAt: null });
    await postReturnReversal(tx, { ...sub, settledAt: null });
    expect(rows.map((row) => row.type)).toEqual(['SALE', 'RETURN_REVERSAL']);
    expect(sumAmounts(rows)).toBe(0);
  });

  it('reverses a sub-order settled before the ledger existed', async () => {
    const { rows, tx } = fakeTx();
    await postReturnReversal(tx, { ...sub, settledAt: new Date() });
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(-850);
  });

  it('leaves alone a return that never reached the ledger', async () => {
    const { rows, tx } = fakeTx();
    expect(await postReturnReversal(tx, { ...sub, settledAt: null })).toBeNull();
    expect(rows).toHaveLength(0);
  });

  it('makes the balance negative after a payout, to come off the next one', async () => {
    const { rows, tx } = fakeTx();
    await postSale(tx, sub);
    await postPayout(tx, { vendorId: 'shop-a', amount: 850, reference: 'UTR1' });
    await postReturnReversal(tx, { ...sub, settledAt: new Date() });
    expect(sumAmounts(rows)).toBe(-850);
  });
});

describe('postAdjustment', () => {
  it('keeps the sign and the note', async () => {
    const { rows, tx } = fakeTx();
    await postAdjustment(tx, { vendorId: 'shop-a', amount: -40, note: 'Courier damage' });
    expect(rows[0]).toMatchObject({ type: 'ADJUSTMENT', amount: -40, note: 'Courier damage' });
  });
});

describe('statements', () => {
  const rows = [
    entry({ id: '1', type: 'SALE', amount: 500, sellerOrderId: 'sub-1' }),
    entry({ id: '2', type: 'PAYOUT', amount: -500, reference: 'UTR,1' }),
    entry({ id: '3', type: 'ADJUSTMENT', amount: -20, note: '=cmd' }),
  ];

  it('runs the balance from the opening figure', () => {
    const stmt = withRunningBalance(100, rows);
    expect(stmt.entries.map((e) => e.balanceAfter)).toEqual([600, 100, 80]);
    expect(stmt.closingBalance).toBe(80);
  });

  it('exports CSV with quoting and no formula injection', () => {
    const csv = statementCsv(withRunningBalance(0, rows), new Map([['sub-1', 'CI-1-A']]));
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('Date,Type,Order,Reference,Note,Amount,Balance');
    expect(lines[2]).toContain('CI-1-A');
    expect(lines[3]).toContain('"UTR,1"');
    expect(lines[4]).toContain("'=cmd");
    expect(lines[5]).toBe(',CLOSING,,,,,-20.00');
  });
});
