'use client';

import React, { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProductThumb, isColorThumb } from '@/components/product/ProductThumb';
import { useCan } from '@/components/admin/StaffContext';
import {
  CLOSED_ORDER_STATUSES,
  NEXT_ORDER_STATUS,
  canCancel,
  canMarkReturned,
  cancelAdminOrder,
  decideReturn,
  getAdminOrder,
  refundAdminOrder,
  saveAdminOrderNotes,
  setAdminOrderStatus,
  statusLabel,
  type AdminOrderAddress,
  type AdminOrderDetail,
  type AdminReturnRequest,
} from '@/lib/admin-orders';
import { announceQueuesChanged } from '@/lib/admin-moderation';
import { formatPaise, paiseToRupees, rupeesToPaise } from '@/lib/money';

/**
 * One order, in full: what was ordered, which shops are sending it, what has
 * happened to it, who it is for and how it was paid.
 *
 * Cancelling and marking returned live here rather than in the table because
 * neither is a step forward and both are final. Which of the two is offered
 * follows the API's own rules — an order can be called off until it closes,
 * goods can only come back after they arrived — so a control is hidden rather
 * than offering a click that answers 409. Actions the signed-in staff member's
 * permissions do not cover are left out (status, cancel, notes and returns
 * need SUPPORT; refunds need FINANCE).
 *
 * The status change is sent as the parent status only. Cascading it onto the
 * shops' parts is the server's job.
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

const methodLabel = (method: string | null): string =>
  !method
    ? 'Not recorded'
    : method === 'COD'
      ? 'Cash on delivery'
      : method === 'RAZORPAY'
        ? 'Razorpay (online)'
        : statusLabel(method);

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
const errorText: React.CSSProperties = { color: 'var(--a-bad)', marginTop: 8 };

/**
 * Timeline notes are written by the server with raw enum values ("Status
 * changed to READY_FOR_SHIPMENT"); read them as words, keeping acronyms.
 */
const readable = (message: string): string =>
  message.replace(/\b[A-Z][A-Z_]{2,}\b/g, (token) =>
    token === 'COD' ? token : statusLabel(token).toLowerCase()
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
  if (!address || !address.line1) {
    return (
      <p className="admin-kpi-sub" style={{ margin: 0 }}>
        {fallback}
      </p>
    );
  }
  return (
    <div style={{ color: 'var(--a-text)', fontSize: 13, lineHeight: 1.6 }}>
      <div>{address.fullName}</div>
      <div>{address.line1}</div>
      {address.line2 && <div>{address.line2}</div>}
      <div>
        {address.city}, {address.state} {address.postalCode}
      </div>
      <div>{address.country}</div>
      {address.phone && (
        <div style={{ marginTop: 6, color: 'var(--a-text-dim)' }}>{address.phone}</div>
      )}
      {address.email && <div style={{ color: 'var(--a-text-dim)' }}>{address.email}</div>}
      {address.gstin && <div style={{ color: 'var(--a-text-dim)' }}>GST {address.gstin}</div>}
    </div>
  );
};

const sameAddress = (a: AdminOrderAddress | null, b: AdminOrderAddress | null) =>
  JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

/**
 * Refund through Razorpay (FINANCE). Offered only for an online payment with
 * something left to refund; a COD order is refunded by bank transfer outside
 * the console. A refund asks twice.
 */
function RefundForm({
  order,
  onDone,
}: {
  order: AdminOrderDetail;
  onDone: (message: string) => void;
}) {
  const refundable = order.totalPaise - order.refundedPaise;
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountPaise = amount.trim() === '' ? undefined : rupeesToPaise(Number(amount));

  const refund = async () => {
    if (!reason.trim()) {
      setError('Give a reason for the refund.');
      return;
    }
    if (
      amountPaise !== undefined &&
      (!Number.isFinite(amountPaise) || amountPaise <= 0 || amountPaise > refundable)
    ) {
      setError(
        `Refund between ₹1 and ${formatPaise(refundable)}, or leave the amount empty for all of it.`
      );
      return;
    }
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(await refundAdminOrder(order.id, { amountPaise, reason: reason.trim() }));
      setAmount('');
      setReason('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--a-edge)' }}>
      <p className="admin-kpi-label">Refund via Razorpay</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <input
          type="number"
          min={1}
          step="0.01"
          max={paiseToRupees(refundable)}
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setConfirm(false);
          }}
          placeholder={`All ${formatPaise(refundable)}`}
          aria-label="Refund amount in rupees"
          style={{ flex: '1 1 120px', minWidth: 0 }}
        />
        <input
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason (required)"
          aria-label="Refund reason"
          style={{ flex: '2 1 160px', minWidth: 0 }}
        />
        <button type="button" className="btn btn-danger" disabled={busy} onClick={refund}>
          {busy
            ? 'Refunding…'
            : confirm
              ? `Confirm refund of ${formatPaise(amountPaise ?? refundable)}`
              : 'Refund'}
        </button>
      </div>
      {error && (
        <p className="admin-kpi-sub" role="alert" style={errorText}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Staff-only notes (SUPPORT). Saved explicitly, never shown to the customer. */
function NotesEditor({
  order,
  editable,
  onDone,
}: {
  order: AdminOrderDetail;
  editable: boolean;
  onDone: (message: string) => void;
}) {
  const [value, setValue] = useState(order.adminNotes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = value !== (order.adminNotes ?? '');

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await saveAdminOrderNotes(order.id, value));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-card">
      <p className="admin-kpi-label">Staff notes</p>
      {editable ? (
        <>
          <textarea
            rows={3}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Only staff see this."
            aria-label="Staff notes"
            style={{ width: '100%', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={!dirty || busy}
              onClick={save}
            >
              {busy ? 'Saving…' : 'Save notes'}
            </button>
          </div>
          {error && (
            <p className="admin-kpi-sub" role="alert" style={errorText}>
              {error}
            </p>
          )}
        </>
      ) : (
        <p className="admin-kpi-sub" style={{ margin: 0 }}>
          {order.adminNotes || 'No notes.'}
        </p>
      )}
    </div>
  );
}

/**
 * A return or exchange request and its decision (SUPPORT): approve or reject
 * it, then complete it once the goods are back — which refunds, restocks and
 * reverses the shops' earnings.
 */
function ReturnCard({
  request,
  orderTotalPaise,
  refundedPaise,
  editable,
  onDone,
}: {
  request: AdminReturnRequest;
  orderTotalPaise: number;
  refundedPaise: number;
  editable: boolean;
  onDone: (message: string) => void;
}) {
  const [mode, setMode] = useState<'reject' | 'complete' | null>(null);
  const [note, setNote] = useState('');
  const [refund, setRefund] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refundable = orderTotalPaise - refundedPaise;
  const isOpen = !['REJECTED', 'COMPLETED'].includes(request.status);

  const decide = async (status: 'APPROVED' | 'REJECTED' | 'COMPLETED') => {
    if (status === 'REJECTED' && !note.trim()) {
      setError('Say why — the customer sees it.');
      return;
    }
    const refundPaise =
      status === 'COMPLETED' && refund.trim() !== '' ? rupeesToPaise(Number(refund)) : undefined;
    if (refundPaise !== undefined && (!Number.isFinite(refundPaise) || refundPaise < 0)) {
      setError('Enter a refund in rupees, or leave it empty for the full amount.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(
        await decideReturn(request.id, {
          status,
          ...(refundPaise !== undefined ? { refundPaise } : {}),
          ...(note.trim() ? { notes: note.trim() } : {}),
        })
      );
      setMode(null);
      setNote('');
      setRefund('');
      announceQueuesChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-card">
      <p className="admin-kpi-label" style={{ marginBottom: 12 }}>
        {request.requestType === 'EXCHANGE' ? 'Exchange request' : 'Return request'}
      </p>
      <dl className="admin-dl">
        <Field label="Reason">{statusLabel(request.reason)}</Field>
        <Field label="State">
          <span className="admin-status-badge" data-status={request.status}>
            {statusLabel(request.status)}
          </span>
        </Field>
        <Field label="Raised">{stamp(request.createdAt)}</Field>
        {request.refundPaise !== null && request.refundPaise !== undefined && (
          <Field label="Refund">
            {formatPaise(request.refundPaise)}
            {request.refundedAt ? ` · sent ${day(request.refundedAt)}` : ''}
          </Field>
        )}
        {request.description && (
          <div style={{ gridColumn: '1 / -1' }}>
            <dt>Detail</dt>
            <dd>{request.description}</dd>
          </div>
        )}
        {request.notes && (
          <div style={{ gridColumn: '1 / -1' }}>
            <dt>Staff note</dt>
            <dd>{request.notes}</dd>
          </div>
        )}
      </dl>
      {request.images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {request.images.map((src) => (
            <a key={src} href={src} target="_blank" rel="noopener noreferrer">
              <LineThumb src={src} />
            </a>
          ))}
        </div>
      )}

      {editable && isOpen && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--a-edge)' }}>
          {mode === null && (
            <div className="admin-actions" style={{ justifyContent: 'flex-start' }}>
              {request.status !== 'APPROVED' && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={busy}
                  onClick={() => decide('APPROVED')}
                >
                  {busy ? 'Saving…' : 'Approve'}
                </button>
              )}
              {request.status === 'APPROVED' && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={busy}
                  onClick={() => setMode('complete')}
                >
                  Goods received — complete
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={() => setMode('reject')}
              >
                Reject…
              </button>
            </div>
          )}
          {mode !== null && (
            <div style={{ display: 'grid', gap: 8 }}>
              {mode === 'complete' && (
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={refund}
                  onChange={(event) => setRefund(event.target.value)}
                  placeholder={`Refund — empty for all ${formatPaise(refundable)}`}
                  aria-label="Refund in rupees"
                />
              )}
              <textarea
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={
                  mode === 'reject'
                    ? 'Why it is rejected (the customer sees this)'
                    : 'Note (optional)'
                }
                aria-label="Decision note"
                style={{ width: '100%', resize: 'vertical' }}
              />
              <div className="admin-actions" style={{ justifyContent: 'flex-start' }}>
                <button
                  type="button"
                  className={mode === 'reject' ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-primary'}
                  disabled={busy}
                  onClick={() => decide(mode === 'reject' ? 'REJECTED' : 'COMPLETED')}
                >
                  {busy ? 'Saving…' : mode === 'reject' ? 'Reject request' : 'Complete return'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() => setMode(null)}
                >
                  Back
                </button>
              </div>
            </div>
          )}
          {error && (
            <p className="admin-kpi-sub" role="alert" style={errorText}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

type Dialog = 'CANCELLED' | 'RETURNED' | 'SHIPPED';

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const can = useCan();
  const canSupport = can('SUPPORT');
  const canFinance = can('FINANCE');

  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [reason, setReason] = useState('');
  const [tracking, setTracking] = useState('');
  const [carrier, setCarrier] = useState('');
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

  const done = (message: string) => {
    setNotice(message);
    void load();
  };

  const run = async (action: () => Promise<string>) => {
    setIsSaving(true);
    setError(null);
    try {
      const message = await action();
      setNotice(message);
      setDialog(null);
      setReason('');
      setTracking('');
      setCarrier('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const openDialog = (next: Dialog) => {
    setError(null);
    setReason('');
    setTracking(order?.trackingNumber ?? '');
    setCarrier(order?.carrier ?? '');
    setDialog(next);
  };

  const confirmDialog = () => {
    if (!dialog) return;
    if (dialog === 'CANCELLED') {
      if (!reason.trim()) return setError('Give a reason — the customer sees it.');
      return run(() => cancelAdminOrder(id, reason.trim()));
    }
    if (dialog === 'SHIPPED') {
      if (!tracking.trim()) return setError('Add the tracking number to mark it shipped.');
      return run(() =>
        setAdminOrderStatus(id, {
          status: 'SHIPPED',
          trackingNumber: tracking.trim(),
          carrier: carrier.trim() || undefined,
          message: reason.trim() || undefined,
        })
      );
    }
    return run(() =>
      setAdminOrderStatus(id, { status: 'RETURNED', message: reason.trim() || undefined })
    );
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
  const cancellable = canSupport && canCancel(order.status);
  const returnable = canSupport && canMarkReturned(order.status);
  const nextStatus = canSupport ? NEXT_ORDER_STATUS[order.status] : undefined;
  const itemCount = order.items.reduce((sum, line) => sum + line.quantity, 0);
  const billingIsSeparate =
    Boolean(order.billingAddress?.line1) &&
    !sameAddress(order.billingAddress, order.shippingAddress);
  const shipTo = order.shippingAddress;
  const canRefund =
    canFinance &&
    order.paymentMethod === 'RAZORPAY' &&
    (order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED') &&
    order.totalPaise - order.refundedPaise > 0;

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">{order.orderNumber}</h1>
          <p className="admin-page-sub">
            Placed {stamp(order.createdAt)} by {shipTo?.fullName || order.contactEmail}
          </p>
        </div>
        <div className="admin-page-actions">
          {cancellable && (
            <button
              type="button"
              className="btn"
              disabled={isSaving}
              onClick={() => openDialog('CANCELLED')}
            >
              Cancel order
            </button>
          )}
          {returnable && (
            <button
              type="button"
              className="btn"
              disabled={isSaving}
              onClick={() => openDialog('RETURNED')}
            >
              Mark returned
            </button>
          )}
          {nextStatus && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={isSaving}
              onClick={() =>
                nextStatus === 'SHIPPED'
                  ? openDialog('SHIPPED')
                  : void run(() => setAdminOrderStatus(id, { status: nextStatus }))
              }
            >
              {isSaving ? 'Saving…' : `Mark ${statusLabel(nextStatus).toLowerCase()}`}
            </button>
          )}
        </div>
      </div>

      {error && !dialog && (
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
          value={formatPaise(order.totalPaise)}
          sub={`${itemCount} item${itemCount === 1 ? '' : 's'} across ${order.items.length} line${order.items.length === 1 ? '' : 's'}`}
        />
        <Kpi
          label="Payment"
          value={methodLabel(order.paymentMethod)}
          sub={`${statusLabel(order.paymentStatus)}${order.refundedPaise > 0 ? ` · ${formatPaise(order.refundedPaise)} refunded` : ''}`}
        />
        <Kpi
          label="Delivery"
          value={order.deliveredAt ? day(order.deliveredAt) : 'Not delivered'}
          sub={
            order.trackingNumber
              ? `${order.carrier ?? 'Carrier'} · ${order.trackingNumber}`
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
                    const lineTotal = line.unitPaise * line.quantity - (line.discountPaise ?? 0);
                    const variantLabel = [line.color, line.size].filter(Boolean).join(' · ');
                    const options = line.customization ? Object.keys(line.customization).length : 0;
                    const shop = order.sellerOrders.find((part) => part.sellerId === line.sellerId);
                    return (
                      <tr key={line.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <LineThumb src={line.mockupImage ?? line.thumbnail} />
                            <span style={{ minWidth: 0 }}>
                              <Link
                                href={`/admin/products/${line.productId}`}
                                className="admin-row-title"
                              >
                                {line.name}
                              </Link>
                              {variantLabel && <span style={dim}>{variantLabel}</span>}
                              {order.sellerOrders.length > 1 && shop && (
                                <span style={dim}>{shop.shopName}</span>
                              )}
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
                        <td style={{ textAlign: 'right' }}>{formatPaise(line.unitPaise)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 650 }}>
                          {formatPaise(lineTotal)}
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
              <p className="admin-kpi-label">Shops</p>
              <p className="admin-kpi-sub" style={{ marginBottom: 12 }}>
                This order ships in {order.sellerOrders.length} parcel
                {order.sellerOrders.length === 1 ? '' : 's'}, one per shop, and is paid out per
                shop.
              </p>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th>Shop</th>
                      <th>Status</th>
                      <th>Tracking</th>
                      <th>Shipped</th>
                      <th>Delivered</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.sellerOrders.map((part) => (
                      <tr key={part.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{part.orderNumber}</td>
                        <td>{part.shopName}</td>
                        <td>
                          <span className="admin-status-badge" data-status={part.status}>
                            {statusLabel(part.status)}
                          </span>
                        </td>
                        <td>
                          {part.trackingNumber
                            ? `${part.carrier ?? 'Carrier'} · ${part.trackingNumber}`
                            : '—'}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{day(part.shippedAt)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{day(part.deliveredAt)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 650 }}>
                          {formatPaise(part.totalPaise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {order.returnRequest && (
            <ReturnCard
              request={order.returnRequest}
              orderTotalPaise={order.totalPaise}
              refundedPaise={order.refundedPaise}
              editable={canSupport}
              onDone={done}
            />
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
                    {order.timeline.map((entry, index) => (
                      <tr key={`${entry.createdAt}-${index}`}>
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
              <Field label="Name">{shipTo?.fullName || '—'}</Field>
              <Field label="Email">{order.contactEmail || '—'}</Field>
              <Field label="Phone">{shipTo?.phone || '—'}</Field>
            </dl>
            {canSupport && (
              <Link
                href={`/admin/customers/${order.customerId}`}
                className="btn btn-sm"
                style={{ marginTop: 12 }}
              >
                Customer account
              </Link>
            )}
            {order.notes && (
              <>
                <p className="admin-kpi-label" style={sectionGap}>
                  Customer note
                </p>
                <p style={{ margin: 0, color: 'var(--a-text)', fontSize: 13 }}>{order.notes}</p>
              </>
            )}
          </div>

          <NotesEditor
            key={order.adminNotes ?? ''}
            order={order}
            editable={canSupport}
            onDone={done}
          />

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
              {order.refundedPaise > 0 && (
                <Field label="Refunded">{formatPaise(order.refundedPaise)}</Field>
              )}
              {order.paymentDueBy && order.paymentStatus === 'PENDING' && (
                <Field label="Pay by">{stamp(order.paymentDueBy)}</Field>
              )}
            </dl>
            {order.paymentMethod === 'COD' && order.paymentStatus === 'PENDING' && (
              <p className="admin-kpi-sub" style={{ marginTop: 8 }}>
                Collected on delivery: marking the order delivered records it as paid.
              </p>
            )}

            {canRefund && <RefundForm order={order} onDone={done} />}

            <p className="admin-kpi-label" style={sectionGap}>
              Totals
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table" style={{ minWidth: 0 }}>
                <tbody>
                  <tr>
                    <td>Subtotal</td>
                    <td style={{ textAlign: 'right' }}>{formatPaise(order.subtotalPaise)}</td>
                  </tr>
                  {order.discountPaise > 0 && (
                    <tr>
                      <td>Discount{order.couponCode ? ` · ${order.couponCode}` : ''}</td>
                      <td style={{ textAlign: 'right' }}>−{formatPaise(order.discountPaise)}</td>
                    </tr>
                  )}
                  {order.taxPaise > 0 && (
                    <tr>
                      <td>Tax</td>
                      <td style={{ textAlign: 'right' }}>{formatPaise(order.taxPaise)}</td>
                    </tr>
                  )}
                  <tr>
                    <td>Shipping</td>
                    <td style={{ textAlign: 'right' }}>
                      {order.shippingPaise > 0 ? formatPaise(order.shippingPaise) : 'Free'}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 650 }}>Total</td>
                    <td style={{ textAlign: 'right', fontWeight: 650 }}>
                      {formatPaise(order.totalPaise)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {dialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Move ${order.orderNumber} to ${statusLabel(dialog)}`}
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
          <div className="admin-card" style={{ maxWidth: 460, width: '100%' }}>
            <p className="admin-kpi-label">
              {dialog === 'CANCELLED'
                ? 'Cancel order'
                : dialog === 'SHIPPED'
                  ? 'Mark shipped'
                  : 'Mark returned'}
            </p>
            <p className="admin-kpi-value" style={{ fontSize: 22 }}>
              {order.orderNumber}
            </p>
            <p className="admin-kpi-sub" style={{ marginBottom: 12 }}>
              {order.contactEmail} · {formatPaise(order.totalPaise)}
            </p>
            <p className="admin-kpi-sub" style={{ marginBottom: 16 }}>
              {dialog === 'CANCELLED'
                ? 'The order stops here — stock goes back, any coupon is released, every shop’s part follows, a paid order is refunded, and the customer is told the reason below.'
                : dialog === 'SHIPPED'
                  ? 'Every shop’s part moves to shipped with this tracking. The customer can follow it from their order page.'
                  : 'Refunds and restocks the order, exactly as completing a return does, and reverses the shops’ earnings. The order cannot be moved afterwards.'}
            </p>

            {dialog === 'SHIPPED' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <input
                  value={tracking}
                  onChange={(event) => setTracking(event.target.value)}
                  placeholder="Tracking number (required)"
                  aria-label="Tracking number"
                  maxLength={80}
                  style={{ flex: '2 1 180px', minWidth: 0 }}
                />
                <input
                  value={carrier}
                  onChange={(event) => setCarrier(event.target.value)}
                  placeholder="Carrier"
                  aria-label="Carrier"
                  maxLength={80}
                  style={{ flex: '1 1 120px', minWidth: 0 }}
                />
              </div>
            )}
            <textarea
              rows={2}
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                dialog === 'CANCELLED'
                  ? 'Reason (required — the customer sees it)'
                  : 'Note for the timeline (optional)'
              }
              aria-label={dialog === 'CANCELLED' ? 'Cancellation reason' : 'Timeline note'}
              style={{ width: '100%', resize: 'vertical', marginBottom: 12 }}
            />

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
                onClick={() => {
                  setDialog(null);
                  setError(null);
                }}
                disabled={isSaving}
              >
                Keep as is
              </button>
              <button
                type="button"
                className={dialog === 'SHIPPED' ? 'btn btn-primary' : 'btn btn-danger'}
                onClick={() => void confirmDialog()}
                disabled={isSaving}
              >
                {isSaving
                  ? 'Saving…'
                  : dialog === 'CANCELLED'
                    ? 'Cancel this order'
                    : dialog === 'SHIPPED'
                      ? 'Mark shipped'
                      : 'Mark returned'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
