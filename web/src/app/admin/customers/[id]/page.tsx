'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import type { OrderSummary } from '@/lib/admin-reports';
import { formatPaise } from '@/lib/money';
import { formatDate, formatDateTime } from '@/utils/helpers';
import { useCan } from '@/components/admin/StaffContext';

/**
 * One shopper (`GET /admin/customers/{id}`, SUPPORT): the account, saved
 * addresses and their orders, with suspend / reinstate. Suspending signs the
 * customer out everywhere; the API records every view and change in the audit
 * log.
 *
 * Orders are found by the account's email (`GET /admin/orders?q=`), which also
 * matches orders whose contact email merely contains it — the API has no
 * customer-id filter on the order list yet.
 */

interface CustomerRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  /** INDIVIDUAL | BUSINESS */
  type: string;
  status: 'ACTIVE' | 'SUSPENDED' | string;
  emailVerified: boolean;
  orders: number;
  spentPaise: number;
  createdAt: string;
}

interface CustomerAddress {
  fullName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
}

interface CustomerDetail {
  customer: CustomerRow;
  addresses: CustomerAddress[];
}

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
);

const humanStatus = (s: string) =>
  s
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

export default function AdminCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const can = useCan();
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get(`/admin/customers/${encodeURIComponent(id)}`)
      .then((response) => {
        if (cancelled) return;
        const data = response.data?.data as CustomerDetail;
        setDetail(data);
        return apiClient
          .get('/admin/orders', { params: { q: data.customer.email, limit: 50 } })
          .then((list) => {
            if (cancelled) return;
            const rows = (list.data?.data?.items as OrderSummary[]) ?? [];
            const email = data.customer.email.toLowerCase();
            setOrders(rows.filter((order) => order.customerEmail?.toLowerCase() === email));
          });
      })
      .catch((err) => !cancelled && setError(getApiErrorMessage(err, 'Could not load this customer.')));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const setStatus = async (status: 'ACTIVE' | 'SUSPENDED') => {
    if (!detail) return;
    if (
      status === 'SUSPENDED' &&
      !window.confirm(
        `Suspend ${detail.customer.email}? They are signed out everywhere and cannot sign in until reinstated.`
      )
    )
      return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiClient.patch(
        `/admin/customers/${encodeURIComponent(id)}/status`,
        { status }
      );
      setDetail({ ...detail, customer: response.data?.data as CustomerRow });
      setNotice(status === 'SUSPENDED' ? 'Customer suspended.' : 'Customer reinstated.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not change that account.'));
    } finally {
      setSaving(false);
    }
  };

  const customer = detail?.customer;
  const name = customer
    ? [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.email
    : 'Customer';

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">{name}</h1>
          <p className="admin-page-sub">
            {customer
              ? `${customer.email} · joined ${formatDate(customer.createdAt)}`
              : error
                ? 'Not available'
                : 'Loading…'}
          </p>
        </div>
        <div className="admin-page-actions">
          <Link href="/admin/operations/customers" className="btn">
            All customers
          </Link>
          {customer && can('SUPPORT') && (
            <button
              type="button"
              className={customer.status === 'ACTIVE' ? 'btn btn-danger' : 'btn btn-primary'}
              disabled={isSaving}
              onClick={() =>
                void setStatus(customer.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')
              }
            >
              {isSaving ? 'Saving…' : customer.status === 'ACTIVE' ? 'Suspend' : 'Reinstate'}
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

      {customer && (
        <section className="admin-card" style={{ marginBottom: 16 }}>
          <dl className="admin-dl">
            <Fact label="Status">
              <span className="admin-status-badge" data-status={customer.status}>
                {humanStatus(customer.status)}
              </span>
            </Fact>
            <Fact label="Account">{customer.type === 'BUSINESS' ? 'Business' : 'Individual'}</Fact>
            <Fact label="Email">
              {customer.email}{' '}
              <span
                className="admin-status-badge"
                data-status={customer.emailVerified ? 'COMPLETED' : 'PENDING'}
                style={{ marginLeft: 4 }}
              >
                {customer.emailVerified ? 'Verified' : 'Unverified'}
              </span>
            </Fact>
            <Fact label="Phone">{customer.phone ?? '—'}</Fact>
            <Fact label="Orders">{customer.orders.toLocaleString('en-IN')}</Fact>
            <Fact label="Paid to date">{formatPaise(customer.spentPaise)}</Fact>
            <Fact label="Joined">{formatDateTime(customer.createdAt)}</Fact>
          </dl>
        </section>
      )}

      {detail && (
        <section className="admin-card" style={{ marginBottom: 16 }}>
          <h2 className="db-card-title" style={{ marginBottom: 12 }}>
            Addresses
          </h2>
          {detail.addresses.length === 0 ? (
            <p className="ch-empty">No saved addresses.</p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              {detail.addresses.map((address, index) => (
                <address
                  key={index}
                  style={{ fontStyle: 'normal', fontSize: 13, lineHeight: 1.5, color: 'var(--a-text)' }}
                >
                  <strong>{address.fullName}</strong>
                  {address.isDefault && (
                    <span className="admin-status-badge" data-status="ACTIVE" style={{ marginLeft: 6 }}>
                      Default
                    </span>
                  )}
                  <br />
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ''}
                  <br />
                  {address.city}, {address.state} {address.postalCode}
                  {address.phone && (
                    <>
                      <br />
                      {address.phone}
                    </>
                  )}
                </address>
              ))}
            </div>
          )}
        </section>
      )}

      {detail && (
        <section className="admin-card admin-index">
          <h2 className="db-card-title" style={{ padding: '16px 16px 8px' }}>
            Orders
          </h2>
          {orders === null ? (
            <p className="ch-empty" style={{ padding: '0 16px 16px' }}>
              Loading…
            </p>
          ) : orders.length === 0 ? (
            <p className="ch-empty" style={{ padding: '0 16px 16px' }}>
              No orders placed with this email.
            </p>
          ) : (
            <div className="admin-table-wrap" style={{ width: '100%', margin: 0 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Placed</th>
                    <th scope="col">Items</th>
                    <th scope="col">Status</th>
                    <th scope="col">Payment</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link
                          href={`/admin/orders/${order.id}`}
                          style={{ color: 'var(--a-text)', fontWeight: 600, textDecoration: 'none' }}
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td>{formatDate(order.createdAt)}</td>
                      <td>
                        {order.firstItemName ?? '—'}
                        {order.itemCount > 1 ? ` +${order.itemCount - 1}` : ''}
                      </td>
                      <td>
                        <span className="admin-status-badge" data-status={order.status}>
                          {humanStatus(order.status)}
                        </span>
                      </td>
                      <td>
                        {order.paymentMethod} · {humanStatus(order.paymentStatus)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatPaise(order.totalPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
