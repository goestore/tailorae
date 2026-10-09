'use client';

import React, { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProductThumb, isColorThumb } from '@/components/product/ProductThumb';
import {
  CLOSED_ORDER_STATUSES,
  NEXT_ORDER_STATUS,
  canCancel,
  canMarkReturned,
  getAdminOrder,
  setAdminOrderStatus,
  statusLabel,
  type AdminOrderAddress,
  type AdminOrderDetail,
  type AdminOrderStatus,
} from '@/lib/admin-orders';
import {
  PAYMENT_STATUSES,
  refundAdminOrder,
  setAdminOrderPayment,
  type AdminPaymentStatus,
} from '@/lib/admin-orders';
import { formatCurrency } from '@/utils/helpers';

/**
 * One order, in full.
 *
 * The console had no such screen: an order was five columns in a table and a
 * single button that advanced it one step along the fulfilment chain. Anything
 * an admin is actually asked about — what was in the parcel, where it was
 * going, how it was paid for, why it is late — was unanswerable without the
 * database.
 *
 * Cancelling and marking returned live here rather than in the table because
 * neither is a step forward and both are effectively final. Which of the two is
 * available follows the server's own rules — an order can be called off until
 * it closes, and goods can only come back after they arrived — so a control is
 * hidden rather than offering a click that answers 409.
 *
 * The status change is sent as the parent status only. Cascading it onto the
 * seller sub-orders is the server's job, and duplicating that here would give
 * two answers to the question of what a shop's half of an order is doing.
 */

const stamp = (value: string | null | undefined): string =>
  value
    ? new Date(value).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

const day = (value: string | null | undefined): string =>
  value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

/**
 * Payment methods are mostly acronyms. Sentence-casing them turns COD into
 * "Cod", which reads as a fish.
 */
const ACRONYM_METHODS = ['COD', 'UPI', 'PAYPAL'];
const methodLabel = (method: string | null): string =>
  !method ? 'Not recorded' : ACRONYM_METHODS.includes(method) ? method : statusLabel(method);

const customerName = (order: AdminOrderDetail): string =>
  [order.user?.firstName, order.user?.lastName].filter(Boolean).join(' ') ||
  order.user?.email ||
  'Deleted account';

const Kpi: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="admin-card">
    <p className="admin-kpi-label">{label}</p>
    <p className="admin-kpi-value" style={{ fontSize: 20 }}>
      {value}
    </p>
    {sub && <p className="admin-kpi-sub">{sub}</p>}
  </div>
);

/** One label/value pair inside an `.admin-dl`. */
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
);

const column: React.CSSProperties = { display: 'grid', gap: 16, minWidth: 0 };
const sideDl: React.CSSProperties = { gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 };
const sectionGap: React.CSSProperties = { marginTop: 16 };
const dim: React.CSSProperties = { display: 'block', color: 'var(--a-text-dim)', fontSize: 12 };

/**
 * Timeline notes are written by the server with raw enum values ("Status
 * changed to READY_FOR_SHIPMENT"); read them as words, keeping acronyms.
 */
const readable = (message: string): string =>
  message.replace(/\b[A-Z][A-Z_]{2,}\b/g, (token) =>
    ACRONYM_METHODS.includes(token) ? token : statusLabel(token).toLowerCase()
  );

/**
 * A line's picture: a fixed 40×40 tile. A broken or missing image falls back
 * to a neutral placeholder rather than showing wrapped alt text.
 */
const LineThumb: React.FC<{ src: string | null | undefined }> = ({ src }) => {
  const [broken, setBroken] = useState(false);
  const tile: React.CSSProperties = {
    position: 'relative',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: 40,
    height: 40,
    overflow: 'hidden',
    borderRadius: 'var(--a-radius-sm)',
    background: '#f7f7f7',
    boxShadow: 'inset 0 0 0 1px var(--a-edge)',
    color: 'var(--a-text-faint)',
  };
  if (isColorThumb(src)) {
    return (
      <span style={tile} aria-hidden="true">
        <ProductThumb src={src} alt="" fill />
      </span>
    );
  }
  if (src && !broken) {
    return (
      <span style={tile}>
        {/* Remote hosts are not all in next.config's allowlist. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          onError={() => setBroken(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </span>
    );
  }
  return (
    <span style={tile} aria-hidden="true">
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
      </svg>
    </span>
  );
};

/** A postal address as one readable block, rather than eight labelled fields. */
const AddressBlock: React.FC<{ address: AdminOrderAddress | null; fallback: string }> = ({
  address,
  fallback,
}) => {
  if (!address) {
    return (
      <p className="admin-kpi-sub" style={{ margin: 0 }}>
        {fallback}
      </p>
    );
  }
  return (
    <div style={{ color: 'var(--a-text)', fontSize: 13, lineHeight: 1.6 }}>
      <div>{address.fullName}</div>
      <div>{address.addressLine1}</div>
      {address.addressLine2 && <div>{address.addressLine2}</div>}
      <div>
        {address.city}, {address.state} {address.postalCode}
      </div>
      <div>{address.country}</div>
      <div style={{ marginTop: 6, color: 'var(--a-text-dim)' }}>{address.phoneNumber}</div>
      {address.email && <div style={{ color: 'var(--a-text-dim)' }}>{address.email}</div>}
      {address.gstNumber && (
        <div style={{ color: 'var(--a-text-dim)' }}>GST {address.gstNumber}</div>
      )}
    </div>
  );
};

/**
 * Record a payment by hand, or refund through the gateway.
 *
 * Two separate things on purpose: marking an order PAID or REFUNDED records a
 * fact and moves no money; "Refund via Razorpay" actually sends money back
 * and is only offered when a gateway payment exists. A refund asks twice.
 */
function PaymentActions({
  orderId,
  paymentStatus,
  paymentMethod,
  hasGatewayPayment,
  total,
  onDone,
}: {
  orderId: string;
  paymentStatus: string;
  paymentMethod: string | null;
  hasGatewayPayment: boolean;
  total: number;
  onDone: (message: string) => void;
}) {
  const [nextStatus, setNextStatus] = useState<AdminPaymentStatus | ''>('');
  const [reference, setReference] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [busy, setBusy] = useState<'status' | 'refund' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRefund = hasGatewayPayment && paymentStatus === 'PAID' && paymentMethod !== 'COD';

  const saveStatus = async () => {
    if (!nextStatus) return;
    setBusy('status');
    setError(null);
    try {
      onDone(
        await setAdminOrderPayment(orderId, {
          paymentStatus: nextStatus,
          ...(reference.trim() ? { paymentId: reference.trim() } : {}),
        })
      );
      setNextStatus('');
      setReference('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const refund = async () => {
    if (!confirmRefund) {
      setConfirmRefund(true);
      return;
    }
    const amount = refundAmount.trim() === '' ? undefined : Number(refundAmount);
    if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0 || amount > total)) {
      setError(
        `Refund amount must be between 1 and ${formatCurrency(total)}, or empty for the full amount.`
      );
      setConfirmRefund(false);
      return;
    }
    setBusy('refund');
    setError(null);
    try {
      onDone(await refundAdminOrder(orderId, { amount, reason: refundReason.trim() || undefined }));
      setRefundAmount('');
      setRefundReason('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
      setConfirmRefund(false);
    }
  };

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--a-edge)' }}>
      <p className="admin-kpi-label">Record a payment change</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <select
          style={{ flex: '1 1 100%' }}
          aria-label="New payment state"
          value={nextStatus}
          onChange={(event) => setNextStatus(event.target.value as AdminPaymentStatus | '')}
        >
          <option value="">Choose a state…</option>
          {PAYMENT_STATUSES.filter((s) => s !== paymentStatus).map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Reference (optional)"
          aria-label="Payment reference"
          style={{ flex: '1 1 140px', minWidth: 0 }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!nextStatus || busy !== null}
          onClick={saveStatus}
        >
          {busy === 'status' ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p style={{ margin: '6px 0 0', color: 'var(--a-text-dim)', fontSize: 12 }}>
        Records what happened. It does not move money.
      </p>

      {canRefund && (
        <>
          <p className="admin-kpi-label" style={{ marginTop: 16 }}>
            Refund via Razorpay
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <input
              type="number"
              min={1}
              max={total}
              value={refundAmount}
              onChange={(event) => setRefundAmount(event.target.value)}
              placeholder={`Full ${formatCurrency(total)}`}
              aria-label="Refund amount in rupees"
              style={{ flex: '1 1 120px', minWidth: 0 }}
            />
            <input
              type="text"
              value={refundReason}
              onChange={(event) => setRefundReason(event.target.value)}
              placeholder="Reason (optional)"
              aria-label="Refund reason"
              style={{ flex: '2 1 160px', minWidth: 0 }}
            />
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy !== null}
              onClick={refund}
            >
              {busy === 'refund'
                ? 'Refunding…'
                : confirmRefund
                  ? `Confirm refund of ${formatCurrency(refundAmount ? Number(refundAmount) : total)}`
                  : 'Refund'}
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="admin-kpi-sub" role="alert" style={{ color: 'var(--a-bad)', marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The status being confirmed. Only the two irreversible ones ask.
  const [confirming, setConfirming] = useState<AdminOrderStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(
    () =>
      getAdminOrder(id)
        .then((row) => {
          setOrder(row);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    [id]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const applyStatus = async (status: AdminOrderStatus) => {
    setIsSaving(true);
    setError(null);
    try {
      const message = await setAdminOrderStatus(id, status);
      setNotice(message);
      setConfirming(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div>
        <h1 className="admin-page-title">Order</h1>
        <p className="admin-page-sub">Loading…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div>
        <h1 className="admin-page-title">Order</h1>
        <p className="admin-page-sub">{error ?? 'That order could not be found.'}</p>
        <Link href="/admin/operations/orders" className="btn" style={{ marginTop: 16 }}>
          Back to orders
        </Link>
      </div>
    );
  }

  const isClosed = CLOSED_ORDER_STATUSES.includes(order.status);
  const cancellable = canCancel(order.status);
  const returnable = canMarkReturned(order.status);
  const nextStatus = NEXT_ORDER_STATUS[order.status];
  const itemCount = order.items.reduce((sum, line) => sum + line.quantity, 0);
  const billingIsSeparate =
    Boolean(order.billingAddress) && order.billingAddress?.id !== order.shippingAddress?.id;

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">{order.orderNumber}</h1>
          <p className="admin-page-sub">
            Placed {stamp(order.createdAt)} by {customerName(order)}
            {order.isB2B && ' · B2B'}
            {order.isBulkOrder && ' · Bulk'}
          </p>
        </div>
        <div className="admin-page-actions">
          <Link href={`/invoice/${order.id}`} className="btn">
            Invoice
          </Link>
          {cancellable && (
            <button
              type="button"
              className="btn"
              disabled={isSaving}
              onClick={() => setConfirming('CANCELLED')}
            >
              Cancel order
            </button>
          )}
          {returnable && (
            <button
              type="button"
              className="btn"
              disabled={isSaving}
              onClick={() => setConfirming('RETURNED')}
            >
              Mark returned
            </button>
          )}
          {nextStatus && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={isSaving}
              onClick={() => applyStatus(nextStatus)}
            >
              {isSaving ? 'Saving…' : `Mark ${statusLabel(nextStatus).toLowerCase()}`}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert--warn" role="alert" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="admin-alert" role="status" style={{ marginBottom: 16 }}>
          <span>{notice}</span>
        </div>
      )}

      <div className="admin-grid-kpi" style={{ marginBottom: 16 }}>
        <Kpi
          label="Status"
          value={statusLabel(order.status)}
          sub={
            order.status === 'DELIVERED'
              ? 'Closed — can still be marked returned'
              : isClosed
                ? 'Final — cannot be changed'
                : 'In fulfilment'
          }
        />
        <Kpi
          label="Order total"
          value={formatCurrency(order.total)}
          sub={`${itemCount} item${itemCount === 1 ? '' : 's'} across ${order.items.length} line${order.items.length === 1 ? '' : 's'}`}
        />
        <Kpi
          label="Payment"
          value={methodLabel(order.paymentMethod)}
          sub={statusLabel(order.paymentStatus)}
        />
        <Kpi
          label="Delivery"
          value={order.actualDelivery ? day(order.actualDelivery) : 'Not delivered'}
          sub={
            order.trackingNumber
              ? `${order.carrier ?? 'Carrier'} · ${order.trackingNumber}`
              : order.estimatedDelivery
                ? `Estimated ${day(order.estimatedDelivery)}`
                : 'No tracking recorded'
          }
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }}>
        {/* Main column: what was ordered and what has happened to it. */}
        <div style={{ ...column, flex: '2 1 560px' }}>
          <div className="admin-card">
            <p className="admin-kpi-label">Items</p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Unit</th>
                    <th style={{ textAlign: 'right' }}>Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((line) => {
                    const lineTotal = line.price * line.quantity - (line.discount ?? 0);
                    const variantLabel =
                      line.variant?.name ??
                      [line.variant?.color, line.variant?.size].filter(Boolean).join(' · ');
                    const options = line.customization ? Object.keys(line.customization).length : 0;
                    return (
                      <tr key={line.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <LineThumb src={line.mockupImage ?? line.product?.thumbnail} />
                            <span style={{ minWidth: 0 }}>
                              {line.product ? (
                                <Link
                                  href={`/admin/products/${line.productId}`}
                                  className="admin-row-title"
                                >
                                  {line.product.name}
                                </Link>
                              ) : (
                                <span className="admin-row-title">Deleted product</span>
                              )}
                              {variantLabel && <span style={dim}>{variantLabel}</span>}
                              {options > 0 && (
                                <span style={dim}>
                                  Customised · {options} option{options === 1 ? '' : 's'}
                                </span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{line.sku}</td>
                        <td style={{ textAlign: 'right' }}>{line.quantity}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(line.price)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 650 }}>
                          {formatCurrency(lineTotal)}
                        </td>
                      </tr>
                    );
                  })}
                  {order.items.length === 0 && (
                    <tr>
                      <td colSpan={5}>This order has no lines.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {order.sellerOrders.length > 0 && (
            <div className="admin-card">
              <p className="admin-kpi-label">Seller sub-orders</p>
              <p className="admin-kpi-sub" style={{ marginBottom: 12 }}>
                This order ships in {order.sellerOrders.length} parcel
                {order.sellerOrders.length === 1 ? '' : 's'} and is paid out per shop.
              </p>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Sub-order</th>
                      <th>Shop</th>
                      <th style={{ textAlign: 'right' }}>Lines</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th style={{ textAlign: 'right' }}>Commission</th>
                      <th style={{ textAlign: 'right' }}>Payout</th>
                      <th>Settled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.sellerOrders.map((sub) => (
                      <tr key={sub.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{sub.orderNumber}</td>
                        <td>{sub.vendor?.shopName ?? 'House stock'}</td>
                        <td style={{ textAlign: 'right' }}>{sub.items.length}</td>
                        <td>
                          <span className="admin-status-badge" data-status={sub.status}>
                            {statusLabel(sub.status)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(sub.total)}</td>
                        <td style={{ textAlign: 'right' }}>
                          −{formatCurrency(sub.commissionAmount)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 650 }}>
                          {formatCurrency(sub.payoutAmount)}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {sub.settledAt ? day(sub.settledAt) : 'Not yet'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {order.returnRequest && (
            <div className="admin-card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <p className="admin-kpi-label" style={{ margin: 0 }}>
                  Return request
                </p>
                <Link href="/admin/operations/returns" className="btn btn-sm">
                  Process in returns
                </Link>
              </div>
              <dl className="admin-dl">
                <div>
                  <dt>Type</dt>
                  <dd>{statusLabel(order.returnRequest.requestType)}</dd>
                </div>
                <div>
                  <dt>Reason</dt>
                  <dd>{order.returnRequest.reason}</dd>
                </div>
                <div>
                  <dt>State</dt>
                  <dd>
                    <span className="admin-status-badge" data-status={order.returnRequest.status}>
                      {statusLabel(order.returnRequest.status)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Raised</dt>
                  <dd>{stamp(order.returnRequest.createdAt)}</dd>
                </div>
                {order.returnRequest.description && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <dt>Detail</dt>
                    <dd>{order.returnRequest.description}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          <div className="admin-card">
            <p className="admin-kpi-label">Timeline</p>
            {order.timeline.length === 0 ? (
              <p className="admin-kpi-sub">Nothing recorded beyond the order being placed.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Status</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.timeline.map((entry) => (
                      <tr key={entry.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{stamp(entry.createdAt)}</td>
                        <td>
                          <span className="admin-status-badge" data-status={entry.status}>
                            {statusLabel(entry.status)}
                          </span>
                        </td>
                        <td>{entry.message ? readable(entry.message) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Side column: who, where, and how it was paid. */}
        <div style={{ ...column, flex: '1 1 300px' }}>
          <div className="admin-card">
            <p className="admin-kpi-label">Customer</p>
            <dl className="admin-dl" style={sideDl}>
              <Field label="Name">{customerName(order)}</Field>
              <Field label="Email">{order.user?.email ?? '—'}</Field>
              <Field label="Phone">{order.user?.phone ?? '—'}</Field>
              {order.user?.role && <Field label="Account">{statusLabel(order.user.role)}</Field>}
            </dl>
            {order.notes && (
              <>
                <p className="admin-kpi-label" style={sectionGap}>
                  Customer note
                </p>
                <p style={{ margin: 0, color: 'var(--a-text)', fontSize: 13 }}>{order.notes}</p>
              </>
            )}
          </div>

          <div className="admin-card">
            <p className="admin-kpi-label">Shipping address</p>
            <AddressBlock
              address={order.shippingAddress}
              fallback="No shipping address recorded."
            />
            {billingIsSeparate && (
              <>
                <p className="admin-kpi-label" style={sectionGap}>
                  Billing address
                </p>
                <AddressBlock address={order.billingAddress} fallback="Same as shipping." />
              </>
            )}
          </div>

          <div className="admin-card">
            <p className="admin-kpi-label">Payment</p>
            <dl className="admin-dl" style={sideDl}>
              <Field label="Method">{methodLabel(order.paymentMethod)}</Field>
              <Field label="State">{statusLabel(order.paymentStatus)}</Field>
              {order.paymentId && <Field label="Gateway reference">{order.paymentId}</Field>}
              {order.gstNumber && <Field label="GST number">{order.gstNumber}</Field>}
            </dl>

            <PaymentActions
              orderId={order.id}
              paymentStatus={order.paymentStatus}
              paymentMethod={order.paymentMethod}
              hasGatewayPayment={Boolean(order.paymentId)}
              total={order.total}
              onDone={(message) => {
                setNotice(message);
                void load();
              }}
            />

            <p className="admin-kpi-label" style={sectionGap}>
              Totals
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table" style={{ minWidth: 0 }}>
                <tbody>
                  <tr>
                    <td>Subtotal</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(order.subtotal)}</td>
                  </tr>
                  {order.discount > 0 && (
                    <tr>
                      <td>Discount{order.discountCode ? ` · ${order.discountCode}` : ''}</td>
                      <td style={{ textAlign: 'right' }}>−{formatCurrency(order.discount)}</td>
                    </tr>
                  )}
                  {order.tax > 0 && (
                    <tr>
                      <td>Tax</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(order.tax)}</td>
                    </tr>
                  )}
                  {order.gstAmount > 0 && (
                    <tr>
                      <td>GST</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(order.gstAmount)}</td>
                    </tr>
                  )}
                  <tr>
                    <td>Shipping</td>
                    <td style={{ textAlign: 'right' }}>
                      {order.shippingCost > 0 ? formatCurrency(order.shippingCost) : 'Free'}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 650 }}>Total</td>
                    <td style={{ textAlign: 'right', fontWeight: 650 }}>
                      {formatCurrency(order.total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Move ${order.orderNumber} to ${statusLabel(confirming)}`}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            display: 'grid',
            placeItems: 'center',
            padding: 20,
            background: 'rgba(0,0,0,0.6)',
          }}
        >
          <div className="admin-card" style={{ maxWidth: 440, width: '100%' }}>
            <p className="admin-kpi-label">
              {confirming === 'CANCELLED' ? 'Cancel order' : 'Mark returned'}
            </p>
            <p className="admin-kpi-value" style={{ fontSize: 22 }}>
              {order.orderNumber}
            </p>
            <p className="admin-kpi-sub" style={{ marginBottom: 12 }}>
              {customerName(order)} · {formatCurrency(order.total)}
            </p>
            <p className="admin-kpi-sub" style={{ marginBottom: 16 }}>
              {confirming === 'CANCELLED'
                ? 'The order stops here — stock goes back, any coupon is released, each shop’s half follows, and the customer is notified. It cannot be moved back into fulfilment afterwards.'
                : 'Refunds and restocks the order, exactly as completing a return request does, and closes any open return request against it. The order cannot be moved afterwards.'}
            </p>

            {/* The page-level alert sits behind this overlay, so a refusal has
                to be repeated where the admin is actually looking. */}
            {error && (
              <div className="admin-alert admin-alert--warn" style={{ marginBottom: 12 }}>
                <span>{error}</span>
              </div>
            )}

            <div className="admin-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setConfirming(null)}
                disabled={isSaving}
              >
                Keep as is
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => applyStatus(confirming)}
                disabled={isSaving}
              >
                {isSaving
                  ? 'Saving…'
                  : confirming === 'CANCELLED'
                    ? 'Cancel this order'
                    : 'Mark returned'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
