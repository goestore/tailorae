import React from 'react';
import { NEXT_ORDER_STATUS, ORDER_STATUSES, statusLabel } from '@/lib/admin-orders';
import { formatCurrency } from '@/utils/helpers';
import { ProductThumb } from '@/components/product/ProductThumb';
import {
  Bell,
  Boxes,
  FileEdit,
  Mail,
  RotateCcw,
  ShoppingBag,
  Tags,
  Ticket,
  Users,
  type IconProps,
} from '@/components/admin/icons';

/**
 * The per-module configuration of the operations tables: which endpoint, which
 * columns, which row actions, and what the card says when it is empty.
 */

export type Row = Record<string, unknown>;

/** One button in a row's action cell. */
export type RowAction = {
  label: (item: Row) => string;
  path: (item: Row) => string;
  body: (item: Row) => Row;
  method?: 'patch' | 'put';
  /** Not applicable to this row: the button is left out rather than greyed. */
  hidden?: (item: Row) => boolean;
};

export type Column = {
  label: string;
  /** Plain text: what local search matches and the CSV carries. */
  value: (item: Row) => string;
  /** What the cell shows, when that is more than the text. */
  render?: (item: Row) => React.ReactNode;
  align?: 'right';
  /** The column that takes the slack, so short columns stay tight. */
  grow?: boolean;
};

export type Section = {
  title: string;
  description: string;
  endpoint: string;
  collection?: string;
  columns?: Column[];
  actions?: RowAction[];
  /**
   * The endpoint pages its results. Search and status filtering then have to go
   * to the server too — a filter applied here could only ever narrow the page
   * already in hand.
   */
  paginated?: boolean;
  /** Query parameter the status select writes to on a paged endpoint. */
  statusParam?: string;
  /** Fixed vocabulary for that select: the rows on screen are not the whole set. */
  statusOptions?: readonly string[];
  /** Where a row leads, for modules that have a record of their own. */
  href?: (item: Row) => string;
  /** What the card says when there is nothing in it yet. */
  empty?: { icon: React.FC<IconProps>; title: string; text: string };
};

export const text = (value: unknown) =>
  value === null || value === undefined || value === '' ? '—' : String(value);
export const date = (value: unknown) =>
  value ? new Date(String(value)).toLocaleDateString('en-IN') : '—';
export const money = (value: unknown) => formatCurrency(Number(value) || 0);

/** An enum value as a sentence: READY_FOR_SHIPMENT -> "Ready for shipment". */
export const sentence = (value: unknown) => (value ? statusLabel(String(value)) : '—');

const badge = (status: string, label: string = sentence(status)) => (
  <span className="admin-status-badge" data-status={status}>
    {label}
  </span>
);

const ROLE_LABELS: Record<string, string> = {
  B2B_BUYER: 'B2B buyer',
  RETAIL_CUSTOMER: 'Retail',
  VENDOR: 'Seller',
  ADMIN: 'Admin',
};
const roleLabel = (role: unknown) => ROLE_LABELS[String(role)] ?? sentence(role);

/** A status column: plain text for CSV, a badge on screen. */
const statusColumn = (): Column => ({
  label: 'Status',
  value: (x) => sentence(x.status),
  render: (x) => (x.status ? badge(String(x.status)) : '—'),
});

/** A yes/no field shown as a badge: green when on, neutral when off. */
const flagColumn = (label: string, read: (x: Row) => unknown, on: string, off: string): Column => ({
  label,
  value: (x) => (read(x) ? on : off),
  render: (x) => (read(x) ? badge('ACTIVE', on) : badge('NEUTRAL', off)),
});

const rowTitle = (value: string) => <span className="admin-row-title">{value}</span>;

const fullName = (x: Row) => [x.firstName, x.lastName].filter(Boolean).join(' ') || text(x.email);

const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'] as const;

const nextOrderStatus = (x: Row) =>
  NEXT_ORDER_STATUS[x.status as keyof typeof NEXT_ORDER_STATUS];

/** Approve, complete, reject — the three ends a return request can come to. */
const returnActions = (): RowAction[] => [
  {
    label: (x) => (x.status === 'APPROVED' ? 'Complete' : 'Approve'),
    path: (x) => `/admin/returns/${text(x.id)}`,
    body: (x) => ({ status: x.status === 'APPROVED' ? 'COMPLETED' : 'APPROVED' }),
    hidden: (x) => x.status === 'COMPLETED',
  },
  {
    // The backend has always accepted REJECTED. Without it the only way to
    // close a request an admin will not honour was to approve it.
    label: () => 'Reject',
    path: (x) => `/admin/returns/${text(x.id)}`,
    body: () => ({ status: 'REJECTED' }),
    hidden: (x) => x.status === 'REJECTED' || x.status === 'COMPLETED',
  },
];

const requestColumns = (): Column[] => [
  {
    label: 'Order',
    value: (x) => text((x.order as Row)?.orderNumber),
    render: (x) => rowTitle(text((x.order as Row)?.orderNumber)),
  },
  { label: 'Reason', value: (x) => sentence(x.reason) },
  { label: 'Detail', value: (x) => text(x.description), grow: true },
  statusColumn(),
  { label: 'Requested', value: (x) => date(x.createdAt) },
];

const inventoryThumb = (x: Row): string | undefined => {
  if (typeof x.thumbnail === 'string' && x.thumbnail) return x.thumbnail;
  if (Array.isArray(x.images) && typeof x.images[0] === 'string') return x.images[0];
  return undefined;
};

export const SECTIONS: Record<string, Section> = {
  analytics: {
    title: 'Analytics',
    description: 'Store performance at a glance.',
    endpoint: '/admin/reports',
  },
  inventory: {
    title: 'Inventory',
    description: 'Current stock across the catalogue. Stock is editable in place.',
    endpoint: '/admin/inventory',
    collection: 'products',
    empty: { icon: Boxes, title: 'No products yet', text: 'Stock levels appear here once products are added to the catalogue.' },
    columns: [
      {
        label: 'Product',
        value: (x) => text(x.name),
        grow: true,
        render: (x) => {
          const thumb = inventoryThumb(x);
          if (!thumb) return rowTitle(text(x.name));
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{ position: 'relative', flex: '0 0 32px', width: 32, height: 32, borderRadius: 6, overflow: 'hidden' }}
              >
                <ProductThumb src={thumb} alt={text(x.name)} fill sizes="32px" />
              </span>
              {rowTitle(text(x.name))}
            </span>
          );
        },
      },
      { label: 'SKU', value: (x) => text(x.sku) },
      statusColumn(),
      { label: 'Stock', value: (x) => text(x.quantity), align: 'right' },
    ],
  },
  orders: {
    title: 'Orders',
    description: 'All customer orders and their current fulfilment status.',
    endpoint: '/admin/orders',
    collection: 'orders',
    paginated: true,
    statusParam: 'status',
    statusOptions: ORDER_STATUSES,
    href: (x) => `/admin/orders/${text(x.id)}`,
    empty: { icon: ShoppingBag, title: 'No orders yet', text: 'Orders placed in the shop will show up here, newest first.' },
    columns: [
      { label: 'Order', value: (x) => text(x.orderNumber) },
      { label: 'Customer', value: (x) => text((x.user as Row)?.email), grow: true },
      statusColumn(),
      { label: 'Total', value: (x) => money(x.total), align: 'right' },
      { label: 'Placed', value: (x) => date(x.createdAt) },
    ],
    actions: [
      {
        label: (x) => `Mark ${statusLabel(nextOrderStatus(x) ?? '').toLowerCase()}`,
        path: (x) => `/admin/orders/${text(x.id)}/status`,
        body: (x) => ({ status: nextOrderStatus(x) }),
        hidden: (x) => !nextOrderStatus(x),
      },
    ],
  },
  returns: {
    title: 'Returns',
    description: 'Review and process customer return requests.',
    endpoint: '/admin/returns?type=RETURN',
    collection: 'requests',
    empty: { icon: RotateCcw, title: 'No returns yet', text: 'When a customer asks to send something back, the request lands here.' },
    columns: requestColumns(),
    actions: returnActions(),
  },
  exchanges: {
    title: 'Exchanges',
    description: 'Review exchange requests separately from returns.',
    endpoint: '/admin/returns?type=EXCHANGE',
    collection: 'requests',
    empty: { icon: RotateCcw, title: 'No exchanges yet', text: 'Requests to swap a size or colour will appear here.' },
    columns: requestColumns(),
    actions: returnActions(),
  },
  cod: {
    title: 'COD insights',
    description: 'Cash-on-delivery exposure and outcomes.',
    endpoint: '/admin/cod-insights',
  },
  coupons: {
    title: 'Coupons',
    description: 'Active and scheduled promotion codes.',
    endpoint: '/admin/coupons',
    collection: 'coupons',
    empty: { icon: Ticket, title: 'No coupons yet', text: 'Create a code to run a promotion or reward repeat customers.' },
    columns: [
      { label: 'Code', value: (x) => text(x.code), render: (x) => rowTitle(text(x.code)) },
      {
        label: 'Discount',
        value: (x) => (x.discountType === 'PERCENTAGE' ? `${text(x.discountValue)}%` : money(x.discountValue)),
        align: 'right',
      },
      {
        label: 'Used',
        value: (x) => `${text(x.usageCount)}${x.usageLimit ? ` / ${text(x.usageLimit)}` : ''}`,
        align: 'right',
      },
      { label: 'Window', value: (x) => `${date(x.startDate)} – ${date(x.endDate)}`, grow: true },
      flagColumn('Status', (x) => x.isActive, 'Active', 'Inactive'),
    ],
    actions: [
      {
        label: (x) => (x.isActive ? 'Deactivate' : 'Activate'),
        path: (x) => `/admin/coupons/${text(x.id)}`,
        body: (x) => ({ isActive: !x.isActive }),
        method: 'put',
      },
    ],
  },
  customers: {
    title: 'Customers',
    description: 'Customer accounts, roles, and account health.',
    endpoint: '/admin/users',
    collection: 'users',
    paginated: true,
    statusParam: 'status',
    statusOptions: USER_STATUSES,
    empty: { icon: Users, title: 'No customers yet', text: 'Accounts appear here as soon as shoppers sign up.' },
    columns: [
      { label: 'Customer', value: fullName, render: (x) => rowTitle(fullName(x)) },
      { label: 'Email', value: (x) => text(x.email), grow: true },
      { label: 'Role', value: (x) => roleLabel(x.role), render: (x) => badge('NEUTRAL', roleLabel(x.role)) },
      statusColumn(),
    ],
    actions: [
      {
        label: (x) => (x.status === 'ACTIVE' ? 'Suspend' : 'Activate'),
        path: (x) => `/admin/users/${text(x.id)}`,
        body: (x) => ({ status: x.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }),
        method: 'put',
      },
      // Wholesale access. Admin and seller roles are never set from here: sellers
      // come through the seller application, admins are created deliberately.
      {
        label: (x) => (x.role === 'B2B_BUYER' ? 'Make retail' : 'Make B2B buyer'),
        path: (x) => `/admin/users/${text(x.id)}`,
        body: (x) => ({ role: x.role === 'B2B_BUYER' ? 'RETAIL_CUSTOMER' : 'B2B_BUYER' }),
        method: 'put',
        hidden: (x) => x.role === 'ADMIN' || x.role === 'VENDOR',
      },
    ],
  },
  reviews: {
    title: 'Reviews',
    description: 'Moderate customer feedback before it appears in the shop.',
    endpoint: '/admin/reviews',
    collection: 'reviews',
    empty: { icon: FileEdit, title: 'No reviews yet', text: 'Customer reviews wait here for moderation before they go live.' },
    columns: [
      { label: 'Product', value: (x) => text((x.product as Row)?.name), render: (x) => rowTitle(text((x.product as Row)?.name)) },
      { label: 'Customer', value: (x) => text((x.user as Row)?.email) },
      { label: 'Rating', value: (x) => `${text(x.rating)}/5`, align: 'right' },
      { label: 'Review', value: (x) => text(x.comment), grow: true },
      flagColumn('Status', (x) => x.isPublished, 'Published', 'Hidden'),
    ],
    actions: [
      {
        label: (x) => (x.isPublished ? 'Hide' : 'Publish'),
        path: (x) => `/admin/reviews/${text(x.id)}`,
        body: (x) => ({ isPublished: !x.isPublished }),
      },
    ],
  },
  'contact-requests': {
    title: 'Contact requests',
    description: 'Messages submitted through the storefront contact form.',
    endpoint: '/admin/contact-requests',
    collection: 'requests',
    empty: { icon: Mail, title: 'No messages yet', text: 'Messages sent through the contact form will appear here.' },
    columns: [
      { label: 'Name', value: (x) => text(x.name), render: (x) => rowTitle(text(x.name)) },
      { label: 'Email', value: (x) => text(x.email) },
      { label: 'Subject', value: (x) => text(x.subject) },
      { label: 'Message', value: (x) => text(x.message), grow: true },
      statusColumn(),
      { label: 'Received', value: (x) => date(x.createdAt) },
    ],
    actions: [
      {
        label: (x) => (x.status === 'RESOLVED' ? 'Close' : 'Resolve'),
        path: (x) => `/admin/contact-requests/${text(x.id)}`,
        body: (x) => ({ status: x.status === 'RESOLVED' ? 'CLOSED' : 'RESOLVED' }),
        hidden: (x) => x.status === 'CLOSED',
      },
    ],
  },
  // Demand signal for restocking: which design, which size, and how many people
  // are waiting. Outstanding requests sort first.
  'stock-requests': {
    title: 'Back-in-stock requests',
    description: 'Shoppers waiting on something that was sold out when they wanted it.',
    endpoint: '/admin/stock-notifications',
    collection: 'notifications',
    empty: { icon: Bell, title: 'No one is waiting', text: 'When a shopper asks to hear about a sold-out size, the request shows up here.' },
    columns: [
      { label: 'Product', value: (x) => text((x.product as Row)?.name), render: (x) => rowTitle(text((x.product as Row)?.name)), grow: true },
      { label: 'Size', value: (x) => text((x.variant as Row)?.name) },
      { label: 'Email', value: (x) => text(x.email) },
      { label: 'In stock now', value: (x) => text(((x.variant ?? x.product) as Row)?.quantity), align: 'right' },
      { label: 'Asked', value: (x) => date(x.createdAt) },
      {
        label: 'Told',
        value: (x) => (x.notifiedAt ? date(x.notifiedAt) : 'Not yet'),
        render: (x) => (x.notifiedAt ? date(x.notifiedAt) : badge('PENDING', 'Not yet')),
      },
    ],
    actions: [
      {
        label: (x) => (x.notifiedAt ? 'Reopen' : 'Mark as told'),
        path: (x) => `/admin/stock-notifications/${text(x.id)}`,
        body: (x) => ({ notified: !x.notifiedAt }),
      },
    ],
  },
  brands: {
    title: 'Brands',
    description: 'Labels products are sold under. Each one gets its own storefront page.',
    endpoint: '/admin/brands',
    collection: 'brands',
    empty: { icon: Tags, title: 'No brands yet', text: 'Add a brand to give its products a storefront page of their own.' },
    columns: [
      { label: 'Brand', value: (x) => text(x.name), render: (x) => rowTitle(text(x.name)), grow: true },
      { label: 'Slug', value: (x) => text(x.slug) },
      { label: 'Products', value: (x) => text((x._count as Row)?.products ?? 0), align: 'right' },
      {
        label: 'Featured',
        value: (x) => (x.isFeatured ? 'Featured' : ''),
        render: (x) => (x.isFeatured ? badge('DRAFT', 'Featured') : null),
      },
      flagColumn('Status', (x) => x.isActive, 'Active', 'Inactive'),
      // Seller-registered brands wait for review; platform brands are approved.
      {
        label: 'Review',
        value: (x) => sentence(x.status),
        render: (x) => (x.status && x.status !== 'APPROVED' ? badge(String(x.status)) : '—'),
      },
      {
        label: 'Shop',
        value: (x) => text((x.ownerVendor as Row)?.shopName ?? ''),
        render: (x) => text((x.ownerVendor as Row)?.shopName ?? '') || 'Platform',
      },
    ],
    actions: [
      {
        label: (x) => (x.isActive ? 'Deactivate' : 'Activate'),
        path: (x) => `/admin/brands/${text(x.id)}`,
        body: (x) => ({ isActive: !x.isActive }),
        method: 'put',
        // A brand under review is decided with Approve / Edit → Reject instead.
        hidden: (x) => Boolean(x.status) && x.status !== 'APPROVED',
      },
      {
        label: () => 'Approve',
        path: (x) => `/admin/brands/${text(x.id)}/review`,
        body: () => ({ decision: 'approve' }),
        hidden: (x) => !x.status || x.status === 'APPROVED',
      },
    ],
  },
  newsletter: {
    title: 'Newsletter',
    description: 'Addresses collected from the footer and homepage sign-up forms.',
    endpoint: '/admin/newsletter-subscribers',
    collection: 'subscribers',
    empty: { icon: Mail, title: 'No subscribers yet', text: 'Sign-ups from the footer and homepage forms are collected here.' },
    columns: [
      { label: 'Email', value: (x) => text(x.email), render: (x) => rowTitle(text(x.email)), grow: true },
      { label: 'Source', value: (x) => sentence(x.source) },
      flagColumn('Status', (x) => x.isSubscribed, 'Subscribed', 'Unsubscribed'),
      { label: 'Signed up', value: (x) => date(x.createdAt) },
    ],
    actions: [
      {
        label: (x) => (x.isSubscribed ? 'Unsubscribe' : 'Re-subscribe'),
        path: (x) => `/admin/newsletter-subscribers/${text(x.id)}`,
        body: (x) => ({ isSubscribed: !x.isSubscribed }),
      },
    ],
  },
};

/* ----- Summary modules (analytics, COD) ----------------------------------- */

const KPI_LABELS: Record<string, string> = {
  revenue: 'Revenue',
  orderCount: 'Orders',
  activeProducts: 'Live products',
  customers: 'Customers',
  reviewsAwaitingModeration: 'Reviews to moderate',
  productsAwaitingModeration: 'Listings to review',
  sellersAwaitingKyc: 'Sellers awaiting KYC',
  pendingOrders: 'Pending orders',
  pendingValue: 'Pending value',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** Counts that are a to-do list rather than a measure of the business. */
export const ATTENTION_KEYS = new Set([
  'reviewsAwaitingModeration',
  'productsAwaitingModeration',
  'sellersAwaitingKyc',
]);

/** Where each to-do is worked off, when it has a screen of its own. */
export const ATTENTION_LINKS: Record<string, string> = {
  reviewsAwaitingModeration: '/admin/operations/reviews',
  productsAwaitingModeration: '/admin/moderation',
  sellersAwaitingKyc: '/admin/sellers',
};

export const kpiLabel = (key: string) => {
  if (KPI_LABELS[key]) return KPI_LABELS[key];
  const words = key.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const isCurrencyKey = (key: string) => /revenue|value|amount|total/i.test(key);

export const kpiValue = (key: string, value: unknown) =>
  typeof value === 'number'
    ? isCurrencyKey(key)
      ? money(value)
      : value.toLocaleString('en-IN')
    : text(value);
