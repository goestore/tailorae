/**
 * Splitting one order across the shops that fulfil it.
 *
 * A marketplace order is placed once and paid once, but it is fulfilled — and
 * settled — per seller. Until an order can be divided there is nothing to
 * compute a commission against and nothing to pay out, which is why this sits
 * under everything else the seller side needs.
 *
 * Two rules the arithmetic here exists to keep:
 *
 *   1. The parts sum exactly to the whole. An order-level coupon and one
 *      shipping charge have to be spread across sellers, and naive
 *      `Math.round` on each share loses or invents paise — over a month of
 *      orders that is a settlement that never reconciles. Everything below
 *      works in integer paise and hands the rounding remainder to specific
 *      shares (largest remainder first), so the split is exact by construction.
 *
 *   2. The commission rate is snapshotted, per line. Rates change; historical
 *      payouts must not. The rate travels with the split, never read back from
 *      the seller's or category's current settings at settlement time.
 */

/** One line of a seller's slice, before money is allocated. */
export interface SellerLine {
  /** price × quantity, in rupees. */
  subtotal: number;
  /**
   * The rate for this line at the moment of ordering, in percent. Per line, not
   * per seller: one shop selling into two categories pays two rates.
   */
  commissionRate: number;
}

/** One seller's slice of an order, before money is allocated. */
export interface SellerGroup {
  /** Null for house stock — the platform's own listings. */
  vendorId: string | null;
  lines: SellerLine[];
}

/** One line with its share of the discount and its commission, in rupees. */
export interface LineAllocation {
  subtotal: number;
  /** This line's share of its seller's share of the order discount. */
  discount: number;
  commissionRate: number;
  /** Charged on the line's discounted value; never on shipping. */
  commissionAmount: number;
}

/** One seller's slice with its money resolved, all in rupees. */
export interface SellerAllocation {
  vendorId: string | null;
  /** Sum of this seller's lines. */
  subtotal: number;
  /**
   * The effective, blended rate: commission over discounted item value. Equal
   * to the line rate when every line shares one, which is the common case.
   */
  commissionRate: number;
  /** Share of the order-level discount. */
  discount: number;
  /** Share of the order's shipping charge. */
  shippingCost: number;
  /** What the customer paid attributable to this seller. */
  total: number;
  /** Platform's cut: exactly the sum of the lines' commissions. */
  commissionAmount: number;
  /** What the seller is owed. */
  payoutAmount: number;
  /** Same order as the group's `lines`. */
  lines: LineAllocation[];
}

const toPaise = (rupees: number): number => Math.round(rupees * 100);
const toRupees = (paise: number): number => paise / 100;

/**
 * Split `totalPaise` across `weights` so the parts sum to it exactly.
 *
 * Proportional by weight, with the leftover paise going to the largest
 * fractional remainders — the standard largest-remainder method. With no
 * weight at all (a fully discounted order, say) the amount is spread as evenly
 * as it divides, because the alternative is dropping it.
 */
export function allocateProportionally(totalPaise: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  if (totalPaise === 0) return weights.map(() => 0);

  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);

  if (weightSum <= 0) {
    const base = Math.floor(totalPaise / weights.length);
    const shares = weights.map(() => base);
    let leftover = totalPaise - base * weights.length;
    for (let i = 0; leftover > 0; i = (i + 1) % weights.length) {
      shares[i] += 1;
      leftover -= 1;
    }
    return shares;
  }

  const exact = weights.map((weight) => (totalPaise * weight) / weightSum);
  const shares = exact.map((value) => Math.floor(value));
  let leftover = totalPaise - shares.reduce((sum, share) => sum + share, 0);

  // Hand each spare paisa to whichever share was cut hardest.
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; leftover > 0; i += 1) {
    shares[byRemainder[i % byRemainder.length].index] += 1;
    leftover -= 1;
  }

  return shares;
}

/**
 * Allocate an order's discount, shipping and commission across its sellers,
 * and within each seller across its lines.
 *
 * `orderDiscount` and `orderShipping` are the order-level figures the customer
 * saw. Both are spread in proportion to each seller's subtotal, so a seller
 * with two thirds of the basket carries two thirds of the coupon; the seller's
 * discount share is then spread over its own lines the same way.
 *
 * Commission is charged per line on that line's discounted value and never on
 * shipping — the shipping a customer pays covers the courier, and is not the
 * seller's revenue to take a cut of. The seller's commission is the sum of its
 * lines in paise, so the two can never disagree. House stock
 * (`vendorId: null`) is charged nothing: there is no third party to pay.
 */
export function allocateSellerOrders(
  groups: SellerGroup[],
  orderDiscount: number,
  orderShipping: number
): SellerAllocation[] {
  if (groups.length === 0) return [];

  const linePaise = groups.map((group) => group.lines.map((line) => toPaise(line.subtotal)));
  const subtotalsPaise = linePaise.map((lines) => lines.reduce((sum, paise) => sum + paise, 0));
  const discountShares = allocateProportionally(toPaise(orderDiscount), subtotalsPaise);
  const shippingShares = allocateProportionally(toPaise(orderShipping), subtotalsPaise);

  return groups.map((group, index) => {
    const subtotalPaise = subtotalsPaise[index];
    const discountPaise = discountShares[index];
    const shippingPaise = shippingShares[index];
    const lineDiscounts = allocateProportionally(discountPaise, linePaise[index]);

    // A discount can never take a seller's slice below zero, and clamping here
    // rather than trusting the caller keeps a bad coupon from inverting a payout.
    const netPaise = Math.max(0, subtotalPaise - discountPaise);

    const lines = group.lines.map((line, lineIndex) => {
      const rate = group.vendorId ? line.commissionRate : 0;
      const lineNet = Math.max(0, linePaise[index][lineIndex] - lineDiscounts[lineIndex]);
      return {
        subtotalPaise: linePaise[index][lineIndex],
        discountPaise: lineDiscounts[lineIndex],
        rate,
        commissionPaise: Math.round((lineNet * rate) / 100),
      };
    });
    const commissionPaise = lines.reduce((sum, line) => sum + line.commissionPaise, 0);

    return {
      vendorId: group.vendorId,
      commissionRate: blendedRate(lines, netPaise, commissionPaise),
      subtotal: toRupees(subtotalPaise),
      discount: toRupees(discountPaise),
      shippingCost: toRupees(shippingPaise),
      total: toRupees(netPaise + shippingPaise),
      commissionAmount: toRupees(commissionPaise),
      payoutAmount: toRupees(netPaise - commissionPaise),
      lines: lines.map((line) => ({
        subtotal: toRupees(line.subtotalPaise),
        discount: toRupees(line.discountPaise),
        commissionRate: line.rate,
        commissionAmount: toRupees(line.commissionPaise),
      })),
    };
  });
}

/**
 * The single rate a sub-order reports, to two decimals.
 *
 * Commission over net value when there is net value. A fully discounted slice
 * has none, and 0/0 is not a rate — the subtotal-weighted mean of the line
 * rates says what it *would* have been charged, which is what a reader expects.
 */
function blendedRate(
  lines: { subtotalPaise: number; rate: number }[],
  netPaise: number,
  commissionPaise: number
): number {
  if (netPaise > 0) return Math.round((commissionPaise / netPaise) * 10000) / 100;
  const weight = lines.reduce((sum, line) => sum + line.subtotalPaise, 0);
  if (weight <= 0) return lines[0]?.rate ?? 0;
  const mean = lines.reduce((sum, line) => sum + line.rate * line.subtotalPaise, 0) / weight;
  return Math.round(mean * 100) / 100;
}

/**
 * Sub-order numbers derive from the parent, suffixed A, B, C…
 *
 * Readable on an invoice and in support: CI-1234-B is obviously the second
 * shop's half of CI-1234, which a random id would not be.
 */
export function sellerOrderNumber(orderNumber: string, index: number): string {
  const suffix =
    index < 26
      ? String.fromCharCode(65 + index)
      : `${String.fromCharCode(65 + Math.floor(index / 26) - 1)}${String.fromCharCode(65 + (index % 26))}`;
  return `${orderNumber}-${suffix}`;
}
