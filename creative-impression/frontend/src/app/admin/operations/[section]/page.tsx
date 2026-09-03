'use client';

import { use, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

type Section = {
  title: string;
  description: string;
  endpoint: string;
  collection?: string;
  columns?: Array<{ label: string; value: (item: Record<string, unknown>) => string }>;
  action?: { label: (item: Record<string, unknown>) => string; path: (item: Record<string, unknown>) => string; body: (item: Record<string, unknown>) => Record<string, unknown>; method?: 'patch' | 'put'; disabled?: (item: Record<string, unknown>) => boolean };
};

const text = (value: unknown) => (value === null || value === undefined ? '—' : String(value));
const date = (value: unknown) => (value ? new Date(String(value)).toLocaleDateString() : '—');
const nextOrderStatus: Record<string, string> = { PENDING: 'CONFIRMED', CONFIRMED: 'PROCESSING', PROCESSING: 'READY_FOR_SHIPMENT', READY_FOR_SHIPMENT: 'SHIPPED', SHIPPED: 'DELIVERED' };

const SECTIONS: Record<string, Section> = {
  analytics: { title: 'Analytics', description: 'Store performance at a glance.', endpoint: '/admin/reports' },
  inventory: { title: 'Inventory', description: 'Current stock across the catalogue.', endpoint: '/admin/inventory', collection: 'products', columns: [
    { label: 'Product', value: (x) => text(x.name) }, { label: 'SKU', value: (x) => text(x.sku) }, { label: 'Stock', value: (x) => text(x.quantity) }, { label: 'Status', value: (x) => text(x.status) },
  ] },
  orders: { title: 'Orders', description: 'All customer orders and their current fulfilment status.', endpoint: '/admin/orders', collection: 'orders', columns: [
    { label: 'Order', value: (x) => text(x.orderNumber) }, { label: 'Customer', value: (x) => text((x.user as Record<string, unknown>)?.email) }, { label: 'Status', value: (x) => text(x.status) }, { label: 'Total', value: (x) => `₹${text(x.total)}` }, { label: 'Placed', value: (x) => date(x.createdAt) },
  ], action: { label: (x) => nextOrderStatus[text(x.status)] ? `Mark ${nextOrderStatus[text(x.status)].replace(/_/g, ' ').toLowerCase()}` : 'No next step', path: (x) => `/admin/orders/${text(x.id)}/status`, body: (x) => ({ status: nextOrderStatus[text(x.status)] }), disabled: (x) => !nextOrderStatus[text(x.status)] } },
  returns: { title: 'Returns', description: 'Review and process customer return requests.', endpoint: '/admin/returns', collection: 'requests', columns: [
    { label: 'Order', value: (x) => text((x.order as Record<string, unknown>)?.orderNumber) }, { label: 'Reason', value: (x) => text(x.reason) }, { label: 'Detail', value: (x) => text(x.description) }, { label: 'Status', value: (x) => text(x.status) }, { label: 'Requested', value: (x) => date(x.createdAt) },
  ], action: { label: (x) => x.status === 'APPROVED' ? 'Complete' : 'Approve', path: (x) => `/admin/returns/${text(x.id)}`, body: (x) => ({ status: x.status === 'APPROVED' ? 'COMPLETED' : 'APPROVED' }) } },
  exchanges: { title: 'Exchanges', description: 'Review exchange requests separately from returns.', endpoint: '/admin/returns?type=EXCHANGE', collection: 'requests', columns: [
    { label: 'Order', value: (x) => text((x.order as Record<string, unknown>)?.orderNumber) }, { label: 'Reason', value: (x) => text(x.reason) }, { label: 'Detail', value: (x) => text(x.description) }, { label: 'Status', value: (x) => text(x.status) }, { label: 'Requested', value: (x) => date(x.createdAt) },
  ], action: { label: (x) => x.status === 'APPROVED' ? 'Complete' : 'Approve', path: (x) => `/admin/returns/${text(x.id)}`, body: (x) => ({ status: x.status === 'APPROVED' ? 'COMPLETED' : 'APPROVED' }) } },
  cod: { title: 'COD insights', description: 'Cash-on-delivery exposure and outcomes.', endpoint: '/admin/cod-insights' },
  coupons: { title: 'Coupons', description: 'Active and scheduled promotion codes.', endpoint: '/admin/coupons', collection: 'coupons', columns: [
    { label: 'Code', value: (x) => text(x.code) }, { label: 'Discount', value: (x) => `${text(x.discountValue)} ${text(x.discountType)}` }, { label: 'Used', value: (x) => text(x.usageCount) }, { label: 'Active', value: (x) => x.isActive ? 'Active' : 'Inactive' },
  ], action: { label: (x) => x.isActive ? 'Deactivate' : 'Activate', path: (x) => `/admin/coupons/${text(x.id)}`, body: (x) => ({ isActive: !Boolean(x.isActive) }), method: 'put' } },
  customers: { title: 'Customers', description: 'Customer accounts, roles, and account health.', endpoint: '/admin/users', collection: 'users', columns: [
    { label: 'Customer', value: (x) => [x.firstName, x.lastName].filter(Boolean).join(' ') || text(x.email) }, { label: 'Email', value: (x) => text(x.email) }, { label: 'Role', value: (x) => text(x.role) }, { label: 'Status', value: (x) => text(x.status) },
  ], action: { label: (x) => x.status === 'ACTIVE' ? 'Suspend' : 'Activate', path: (x) => `/admin/users/${text(x.id)}`, body: (x) => ({ status: x.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }), method: 'put' } },
  reviews: { title: 'Reviews', description: 'Moderate customer feedback before it appears in the shop.', endpoint: '/admin/reviews', collection: 'reviews', columns: [
    { label: 'Product', value: (x) => text((x.product as Record<string, unknown>)?.name) }, { label: 'Customer', value: (x) => text((x.user as Record<string, unknown>)?.email) }, { label: 'Rating', value: (x) => `${text(x.rating)}/5` }, { label: 'Review', value: (x) => text(x.comment) }, { label: 'Published', value: (x) => x.isPublished ? 'Yes' : 'No' },
  ], action: { label: (x) => x.isPublished ? 'Hide' : 'Publish', path: (x) => `/admin/reviews/${text(x.id)}`, body: (x) => ({ isPublished: !Boolean(x.isPublished) }) } },
  'contact-requests': { title: 'Contact requests', description: 'Messages submitted through the storefront contact form.', endpoint: '/admin/contact-requests', collection: 'requests', columns: [
    { label: 'Name', value: (x) => text(x.name) }, { label: 'Email', value: (x) => text(x.email) }, { label: 'Subject', value: (x) => text(x.subject) }, { label: 'Message', value: (x) => text(x.message) }, { label: 'Status', value: (x) => text(x.status) }, { label: 'Received', value: (x) => date(x.createdAt) },
  ], action: { label: (x) => x.status === 'RESOLVED' ? 'Close' : 'Resolve', path: (x) => `/admin/contact-requests/${text(x.id)}`, body: (x) => ({ status: x.status === 'RESOLVED' ? 'CLOSED' : 'RESOLVED' }), disabled: (x) => x.status === 'CLOSED' } },
};

export default function AdminOperationsPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  const config = SECTIONS[section];
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [coupon, setCoupon] = useState({ code: '', discountType: 'PERCENTAGE', discountValue: '', startDate: '', endDate: '' });
  const [creatingCoupon, setCreatingCoupon] = useState(false);

  useEffect(() => {
    if (!config) return;
    apiClient
      .get(config.endpoint)
      .then((res) => setData(res.data?.data ?? {}))
      .catch((err) => setError(getApiErrorMessage(err, 'Could not load this admin module.')));
  }, [config]);

  const rows = useMemo(() => config?.collection && Array.isArray(data?.[config.collection]) ? data?.[config.collection] as Record<string, unknown>[] : [], [config, data]);
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const status = row.status === undefined ? (row.isActive === undefined ? '' : row.isActive ? 'ACTIVE' : 'INACTIVE') : text(row.status);
      return (statusFilter === '' || status === statusFilter) && (needle === '' || JSON.stringify(row).toLowerCase().includes(needle));
    });
  }, [query, rows, statusFilter]);
  const statuses = useMemo(() => [...new Set(rows.map((row) => row.status === undefined ? (row.isActive === undefined ? '' : row.isActive ? 'ACTIVE' : 'INACTIVE') : text(row.status)).filter(Boolean))].sort(), [rows]);

  const runAction = async (row: Record<string, unknown>) => {
    if (!config?.action) return;
    const id = text(row.id);
    setActionId(id);
    setError(null);
    try {
      await apiClient[config.action.method ?? 'patch'](config.action.path(row), config.action.body(row));
      setData((current) => current && config.collection ? {
        ...current,
        [config.collection]: (current[config.collection] as Record<string, unknown>[]).map((item) => item.id === row.id ? { ...item, ...config.action!.body(row) } : item),
      } : current);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not update this record.'));
    } finally {
      setActionId(null);
    }
  };

  const createCoupon = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setCreatingCoupon(true);
    try {
      const response = await apiClient.post('/admin/coupons', { ...coupon, code: coupon.code.trim().toUpperCase(), discountValue: Number(coupon.discountValue) });
      const created = response.data?.data?.coupon as Record<string, unknown>;
      setData((current) => current ? { ...current, coupons: [created, ...((current.coupons as Record<string, unknown>[]) ?? [])] } : current);
      setCoupon({ code: '', discountType: 'PERCENTAGE', discountValue: '', startDate: '', endDate: '' });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not create this coupon.'));
    } finally {
      setCreatingCoupon(false);
    }
  };

  const exportRows = () => {
    if (!config?.columns || filteredRows.length === 0) return;
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = [
      config.columns.map((column) => escape(column.label)).join(','),
      ...filteredRows.map((row) => config.columns!.map((column) => escape(column.value(row))).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${section}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!config) return <div className="admin-content"><p className="alert alert-error">This admin module does not exist.</p></div>;

  return (
    <div className="admin-content flex flex-col gap-6">
      <header className="admin-page-header"><Link href="/admin">Admin</Link><h1 className="text-2xl text-ink">{config.title}</h1><p className="text-sm text-ink-2">{config.description}</p></header>
      {error && <p className="alert alert-error">{error}</p>}
      {!data && !error && <p className="text-sm text-ink-3">Loading…</p>}
      {data && config.collection && <div className="admin-list-toolbar"><p>{filteredRows.length} of {rows.length} records</p><div>{statuses.length > 0 && <label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All states</option>{statuses.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}</select></label>}<label><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${config.title.toLowerCase()}`} /></label>{(query !== '' || statusFilter !== '') && <button type="button" className="admin-clear-filters" onClick={() => { setQuery(''); setStatusFilter(''); }}>Clear filters</button>}<button type="button" className="admin-export-button" disabled={filteredRows.length === 0} onClick={exportRows}>Export CSV <span aria-hidden="true">↓</span></button></div></div>}
      {section === 'coupons' && <form className="admin-coupon-form" onSubmit={createCoupon}>
        <div><label htmlFor="coupon-code">New promotion</label><input id="coupon-code" required value={coupon.code} placeholder="WELCOME10" onChange={(event) => setCoupon({ ...coupon, code: event.target.value })} /></div>
        <div><label htmlFor="coupon-type">Discount type</label><select id="coupon-type" value={coupon.discountType} onChange={(event) => setCoupon({ ...coupon, discountType: event.target.value })}><option value="PERCENTAGE">Percentage</option><option value="FIXED_AMOUNT">Fixed amount</option></select></div>
        <div><label htmlFor="coupon-value">Value</label><input id="coupon-value" required min="0" step="0.01" type="number" value={coupon.discountValue} onChange={(event) => setCoupon({ ...coupon, discountValue: event.target.value })} /></div>
        <div><label htmlFor="coupon-start">Starts</label><input id="coupon-start" required type="date" value={coupon.startDate} onChange={(event) => setCoupon({ ...coupon, startDate: event.target.value })} /></div>
        <div><label htmlFor="coupon-end">Ends</label><input id="coupon-end" required type="date" value={coupon.endDate} onChange={(event) => setCoupon({ ...coupon, endDate: event.target.value })} /></div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={creatingCoupon}>{creatingCoupon ? 'Creating…' : 'Create coupon'}</button>
      </form>}
      {data && !config.collection && (
        <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3">
          {Object.entries(data).map(([key, value]) => {
            const isCurrency = typeof value === 'number' && (key.toLowerCase().includes('revenue') || key.toLowerCase().includes('value'));
            return (
              <div key={key} className="bg-white p-5">
                <p className="text-xs uppercase tracking-[.1em] text-ink-3">{key.replace(/([A-Z])/g, ' $1')}</p>
                <p className="mt-2 text-2xl text-ink">{isCurrency ? `₹${text(value)}` : text(value)}</p>
              </div>
            );
          })}
        </div>
      )}
      {data && config.collection && <div className="overflow-x-auto border border-line bg-white"><table className="admin-data-table w-full min-w-[620px] text-left text-sm"><thead className="border-b border-line bg-surface-2"><tr>{config.columns?.map((column) => <th key={column.label} className="px-4 py-3 text-xs uppercase tracking-[.1em] text-ink-3">{column.label}</th>)}{config.action && <th className="px-4 py-3 text-xs uppercase tracking-[.1em] text-ink-3">Action</th>}</tr></thead><tbody>{filteredRows.map((row, index) => <tr key={text(row.id) || index} className="border-b border-line last:border-0">{config.columns?.map((column) => <td key={column.label} className={`px-4 py-3 text-ink-2${['Message', 'Review', 'Detail'].includes(column.label) ? ' admin-data-table-copy' : ''}`}>{column.value(row)}</td>)}{config.action && <td className="px-4 py-3"><button type="button" className="btn btn-secondary btn-sm" disabled={actionId === text(row.id) || Boolean(config.action.disabled?.(row))} onClick={() => runAction(row)}>{actionId === text(row.id) ? 'Saving…' : config.action.label(row)}</button></td>}</tr>)}{filteredRows.length === 0 && <tr><td className="px-4 py-8 text-center text-ink-3" colSpan={(config.columns?.length ?? 0) + (config.action ? 1 : 0)}>{rows.length === 0 ? 'Nothing to show yet.' : 'No records match this search.'}</td></tr>}</tbody></table></div>}
    </div>
  );
}
