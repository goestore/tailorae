import React from 'react';
import { NEXT_ORDER_STATUS, ORDER_STATUSES, statusLabel } from '@/lib/admin-orders';
import { couponToRequest, formatCouponValue, type AdminCoupon } from '@/lib/admin-coupons';
import type { StaffPermission } from '@/lib/admin-staff';
import { formatPaise } from '@/lib/money';
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
  Wallet,
  type IconProps,
} from '@/components/admin/icons';

/**
 * The per-module configuration of the operations tables: which endpoint, which
 * columns, which row actions, and what the card says when it is empty.
 *
 * The API answers lists in two shapes — the paged `{items, total, page, limit,
 * pages}` and, for modules that kept the legacy wrapper, `{<collection>: [...],
 * pagination}`. The table reads either (see `fetchSection`).
 */

export type Row = Record<string, unknown>;

/** One button in a row's action cell. */
export type RowAction = {
  label: (item: Row) => string;
  path: (item: Row) => string;
  body?: (item: Row) => unknown;
  method?: 'patch' | 'put' | 'post' | 'delete';
  /** Not applicable to this row: the button is left out rather than greyed. */
  hidden?: (item: Row) => boolean;
  /** Permissions the call needs (any one); hidden for staff without them. */
  anyOf?: StaffPermission[];
  /**
   * Ask for a note first (a reason the seller or customer will read). The
   * answer is passed to `body` as `item.__note`; cancelling skips the call.
   */
  prompt?: string;
  /** A GET whose `data.url` is a short-lived link, opened in a new tab. */
  opensLink?: boolean;
  /** Asked before the call, for actions that cannot be undone. */
  confirm?: (item: Row) => string;
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
  /** Fixed query parameters, sent on every request. */
  params?: Record<string, string | number | boolean>;
  /** The legacy wrapper's list key; paged endpoints answer `items`. */
  collection?: string;
  columns?: Column[];
  actions?: RowAction[];
  /** Rows of the answer this module shows (one endpoint serving two modules). */
  filter?: (item: Row) => boolean;
  /**
   * The endpoint pages its results. Search and status filtering then have to go
   * to the server too — a filter applied here could only ever narrow the page
   * already in hand.
   */
  paginated?: boolean;
  /** Query parameter the search box writes to on a paged endpoint (none: no search box). */
  searchParam?: string;
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
/** Amounts arrive in paise. */
export const money = (value: unknown) => formatPaise(Number(value) || 0);

/** An enum value as a sentence: READY_FOR_SHIPMENT -> "Ready for shipment". */
export const sentence = (value: unknown) => (value ? statusLabel(String(value)) : '—');

const badge = (status: string, label: string = sentence(status)) => (
  <span className="admin-status-badge" data-status={status}>
    {label}
  </span>
);

/** A status column: plain text for CSV, a badge on screen. */
const statusColumn = (read: (x: Row) => unknown = (x) => x.status, label = 'Status'): Column => ({
  label,
  value: (x) => sentence(read(x)),
  render: (x) => (read(x) ? badge(String(read(x))) : '—'),
});

/** A yes/no field shown as a badge: green when on, neutral when off. */
const flagColumn = (label: string, read: (x: Row) => unknown, on: string, off: string): Column => ({
  label,
  value: (x) => (read(x) ? on : off),
  render: (x) => (read(x) ? badge('ACTIVE', on) : badge('NEUTRAL', off)),
});

const rowTitle = (value: string) => <span className="admin-row-title">{value}</span>;

const fullName = (x: Row) => [x.firstName, x.lastName].filter(Boolean).join(' ') || text(x.email);

const nested = (x: Row, key: string) => (x[key] ?? {}) as Row;

const nextOrderStatus = (x: Row) =>
  NEXT_ORDER_STATUS[x.status as keyof typeof NEXT_ORDER_STATUS];

/* ----- Returns and exchanges --------------------------------------------- */

/** `GET /admin/returns` rows: `{return, orderId, orderNumber, orderTotalPaise, customerEmail}`. */
const returnOf = (x: Row) => nested(x, 'return');

/** Approve, complete, reject — the three ends a return request can come to. */
const returnActions = (): RowAction[] => [
  {
    label: (x) => (returnOf(x).status === 'APPROVED' ? 'Complete' : 'Approve'),
    path: (x) => `/admin/returns/${text(returnOf(x).id)}`,
    body: (x) => ({ status: returnOf(x).status === 'APPROVED' ? 'COMPLETED' : 'APPROVED' }),
    hidden: (x) => ['COMPLETED', 'REJECTED'].includes(String(returnOf(x).status)),
    confirm: (x) =>
      returnOf(x).status === 'APPROVED'
        ? 'Completing restocks the items, reverses the sellers’ earnings and raises the refund. Continue?'
        : '',
    anyOf: ['SUPPORT'],
  },
  {
    label: () => 'Reject',
    path: (x) => `/admin/returns/${text(returnOf(x).id)}`,
    body: (x) => ({ status: 'REJECTED', notes: x.__note }),
    prompt: 'Why is this request being rejected? The customer will see this.',
    hidden: (x) => ['REJECTED', 'COMPLETED'].includes(String(returnOf(x).status)),
    anyOf: ['SUPPORT'],
  },
];

const requestColumns = (): Column[] => [
  {
    label: 'Order',
    value: (x) => text(x.orderNumber),
    render: (x) => rowTitle(text(x.orderNumber)),
  },
  { label: 'Customer', value: (x) => text(x.customerEmail) },
  { label: 'Reason', value: (x) => sentence(returnOf(x).reason) },
  { label: 'Detail', value: (x) => text(returnOf(x).description), grow: true },
  { label: 'Order total', value: (x) => money(x.orderTotalPaise), align: 'right' },
  statusColumn((x) => returnOf(x).status),
  { label: 'Requested', value: (x) => date(returnOf(x).createdAt) },
];

/* ----- Orders ------------------------------------------------------------ */

const orderColumns = (): Column[] => [
  { label: 'Order', value: (x) => text(x.orderNumber) },
  { label: 'Customer', value: (x) => text(x.customerEmail), grow: true },
  {
    label: 'Items',
    value: (x) =>
      `${text(x.firstItemName)}${Number(x.itemCount) > 1 ? ` +${Number(x.itemCount) - 1}` : ''}`,
  },
  statusColumn(),
  {
    label: 'Payment',
    value: (x) => `${text(x.paymentMethod)} · ${sentence(x.paymentStatus)}`,
    render: (x) => (
      <span>
        {text(x.paymentMethod)} {badge(String(x.paymentStatus ?? 'NEUTRAL'))}
      </span>
    ),
  },
  { label: 'Total', value: (x) => money(x.totalPaise), align: 'right' },
  { label: 'Placed', value: (x) => date(x.createdAt) },
];

/* ----- Coupons ----------------------------------------------------------- */

const coupon = (x: Row) => x as unknown as AdminCoupon;

/* ----- Brand authorisations ---------------------------------------------- */

const authBrand = (x: Row) => nested(x, 'brand');
const authSeller = (x: Row) => nested(x, 'seller');

export const SECTIONS: Record<string, Section> = {
  analytics: {
    title: 'Analytics',
    description: 'Sales, sellers and categories over a date range.',
    endpoint: '/admin/reports',
  },
  inventory: {
    title: 'Inventory',
    description: 'Current stock across the catalogue. Stock is editable in place.',
    endpoint: '/admin/inventory',
    collection: 'products',
    empty: {
      icon: Boxes,
      title: 'No products yet',
      text: 'Stock levels appear here once products are added to the catalogue.',
    },
    columns: [
      {
        label: 'Product',
        value: (x) => text(x.name),
        grow: true,
        render: (x) => rowTitle(text(x.name)),
      },
      { label: 'SKU', value: (x) => text(x.sku) },
      { label: 'Shop', value: (x) => text(nested(x, 'seller').shopName) },
      statusColumn(),
      { label: 'Stock', value: (x) => text(x.quantity), align: 'right' },
    ],
  },
  movements: {
    title: 'Stock movements',
    description: 'Every change to a stock level: sales, cancellations, returns and edits.',
    endpoint: '/admin/inventory/movements',
    params: { limit: 500 },
    collection: 'movements',
    empty: {
      icon: Boxes,
      title: 'No stock movements yet',
      text: 'Each sale, cancellation, return and stock edit is recorded here.',
    },
    columns: [
      {
        label: 'Product',
        value: (x) => text(x.productName),
        render: (x) => rowTitle(text(x.productName)),
        grow: true,
      },
      { label: 'Size SKU', value: (x) => text(x.variantSku) },
      {
        label: 'Change',
        value: (x) => (Number(x.delta) > 0 ? `+${text(x.delta)}` : text(x.delta)),
        align: 'right',
      },
      { label: 'Reason', value: (x) => sentence(x.reason) },
      { label: 'Reference', value: (x) => text(x.reference) },
      { label: 'Note', value: (x) => text(x.note) },
      { label: 'When', value: (x) => date(x.createdAt) },
    ],
  },
  orders: {
    title: 'Orders',
    description: 'All customer orders and their current fulfilment status.',
    endpoint: '/admin/orders',
    paginated: true,
    searchParam: 'q',
    statusParam: 'status',
    statusOptions: ORDER_STATUSES,
    href: (x) => `/admin/orders/${text(x.id)}`,
    empty: {
      icon: ShoppingBag,
      title: 'No orders yet',
      text: 'Orders placed in the shop will show up here, newest first.',
    },
    columns: orderColumns(),
    actions: [
      {
        label: (x) => `Mark ${statusLabel(nextOrderStatus(x) ?? '').toLowerCase()}`,
        path: (x) => `/admin/orders/${text(x.id)}/status`,
        body: (x) => ({ status: nextOrderStatus(x) }),
        // Shipping needs a tracking number: that is done on the order page.
        hidden: (x) => !nextOrderStatus(x) || nextOrderStatus(x) === 'SHIPPED',
        anyOf: ['SUPPORT'],
      },
    ],
  },
  returns: {
    title: 'Returns',
    description: 'Review and process customer return requests.',
    endpoint: '/admin/returns',
    params: { limit: 100 },
    filter: (x) => returnOf(x).requestType !== 'EXCHANGE',
    href: (x) => `/admin/orders/${text(x.orderId)}`,
    empty: {
      icon: RotateCcw,
      title: 'No returns yet',
      text: 'When a customer asks to send something back, the request lands here.',
    },
    columns: requestColumns(),
    actions: returnActions(),
  },
  exchanges: {
    title: 'Exchanges',
    description: 'Review exchange requests separately from returns.',
    endpoint: '/admin/returns',
    params: { limit: 100 },
    filter: (x) => returnOf(x).requestType === 'EXCHANGE',
    href: (x) => `/admin/orders/${text(x.orderId)}`,
    empty: {
      icon: RotateCcw,
      title: 'No exchanges yet',
      text: 'Requests to swap a size or colour will appear here.',
    },
    columns: requestColumns(),
    actions: returnActions(),
  },
  cod: {
    title: 'Cash on delivery',
    description: 'Cash-on-delivery orders whose payment has not been collected yet.',
    endpoint: '/admin/orders',
    params: { paymentMethod: 'COD', paymentStatus: 'PENDING' },
    paginated: true,
    searchParam: 'q',
    statusParam: 'status',
    statusOptions: ORDER_STATUSES,
    href: (x) => `/admin/orders/${text(x.id)}`,
    empty: {
      icon: Wallet,
      title: 'Nothing to collect',
      text: 'Cash-on-delivery orders awaiting payment appear here until they are paid or cancelled.',
    },
    columns: orderColumns(),
  },
  coupons: {
    title: 'Coupons',
    description: 'Active and scheduled promotion codes.',
    endpoint: '/admin/coupons',
    params: { limit: 100 },
    paginated: true,
    searchParam: 'q',
    empty: {
      icon: Ticket,
      title: 'No coupons yet',
      text: 'Create a code to run a promotion or reward repeat customers.',
    },
    columns: [
      { label: 'Code', value: (x) => text(x.code), render: (x) => rowTitle(text(x.code)) },
      { label: 'Discount', value: (x) => formatCouponValue(coupon(x)), align: 'right' },
      {
        label: 'Minimum',
        value: (x) => (Number(x.minOrderPaise) > 0 ? money(x.minOrderPaise) : '—'),
        align: 'right',
      },
      {
        label: 'Used',
        value: (x) => `${text(x.usageCount)}${x.usageLimit ? ` / ${text(x.usageLimit)}` : ''}`,
        align: 'right',
      },
      { label: 'Window', value: (x) => `${date(x.startsAt)} – ${date(x.endsAt)}`, grow: true },
      flagColumn('Status', (x) => x.isActive, 'Active', 'Inactive'),
    ],
    actions: [
      {
        label: (x) => (x.isActive ? 'Deactivate' : 'Activate'),
        path: (x) => `/admin/coupons/${text(x.id)}`,
        // The API saves a coupon whole; the toggle sends it back with one change.
        body: (x) => ({ ...couponToRequest(coupon(x)), isActive: !x.isActive }),
        method: 'put',
        anyOf: ['FINANCE', 'CONTENT'],
      },
    ],
  },
  customers: {
    title: 'Customers',
    description: 'Shopper accounts, their orders and spend, and account status.',
    endpoint: '/admin/customers',
    paginated: true,
    searchParam: 'q',
    statusParam: 'status',
    statusOptions: ['ACTIVE', 'SUSPENDED'],
    href: (x) => `/admin/customers/${text(x.id)}`,
    empty: {
      icon: Users,
      title: 'No customers yet',
      text: 'Accounts appear here as soon as shoppers sign up.',
    },
    columns: [
      { label: 'Customer', value: fullName },
      { label: 'Email', value: (x) => text(x.email), grow: true },
      {
        label: 'Type',
        value: (x) => (x.type === 'BUSINESS' ? 'Business' : 'Individual'),
        render: (x) => badge('NEUTRAL', x.type === 'BUSINESS' ? 'Business' : 'Individual'),
      },
      { label: 'Orders', value: (x) => text(x.orders), align: 'right' },
      { label: 'Spent', value: (x) => money(x.spentPaise), align: 'right' },
      statusColumn(),
      { label: 'Joined', value: (x) => date(x.createdAt) },
    ],
    actions: [
      {
        label: (x) => (x.status === 'ACTIVE' ? 'Suspend' : 'Reinstate'),
        path: (x) => `/admin/customers/${text(x.id)}/status`,
        body: (x) => ({ status: x.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }),
        confirm: (x) =>
          x.status === 'ACTIVE'
            ? `Suspend ${text(x.email)}? They are signed out everywhere and cannot sign in until reinstated.`
            : '',
        anyOf: ['SUPPORT'],
      },
    ],
  },
  reviews: {
    title: 'Reviews',
    description: 'Moderate customer feedback in the shop.',
    endpoint: '/admin/reviews',
    paginated: true,
    statusParam: 'published',
    statusOptions: ['true', 'false'],
    empty: {
      icon: FileEdit,
      title: 'No reviews yet',
      text: 'Customer reviews appear here as they are posted.',
    },
    columns: [
      {
        label: 'Review',
        value: (x) => text(x.title),
        render: (x) => rowTitle(text(x.title)),
      },
      { label: 'Author', value: (x) => text(x.authorName) },
      { label: 'Rating', value: (x) => `${text(x.rating)}/5`, align: 'right' },
      { label: 'Comment', value: (x) => text(x.comment), grow: true },
      flagColumn('Buyer', (x) => x.isVerified, 'Verified', 'Unverified'),
      flagColumn('Status', (x) => x.isPublished, 'Published', 'Hidden'),
      { label: 'Posted', value: (x) => date(x.createdAt) },
    ],
    actions: [
      {
        label: (x) => (x.isPublished ? 'Hide' : 'Publish'),
        path: (x) => `/admin/reviews/${text(x.id)}`,
        body: (x) => ({ isPublished: !x.isPublished }),
        anyOf: ['MODERATOR'],
      },
      {
        label: () => 'Delete',
        path: (x) => `/admin/reviews/${text(x.id)}`,
        method: 'delete',
        confirm: () => 'Delete this review for good? Hiding it keeps the record.',
        anyOf: ['MODERATOR'],
      },
    ],
  },
  'contact-requests': {
    title: 'Contact requests',
    description: 'Messages submitted through the storefront contact form.',
    endpoint: '/admin/contact-requests',
    collection: 'requests',
    paginated: true,
    statusParam: 'status',
    statusOptions: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
    empty: {
      icon: Mail,
      title: 'No messages yet',
      text: 'Messages sent through the contact form will appear here.',
    },
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
        label: () => 'Start',
        path: (x) => `/admin/contact-requests/${text(x.id)}`,
        body: () => ({ status: 'IN_PROGRESS' }),
        hidden: (x) => x.status !== 'OPEN',
        anyOf: ['SUPPORT'],
      },
      {
        label: (x) => (x.status === 'RESOLVED' ? 'Close' : 'Resolve'),
        path: (x) => `/admin/contact-requests/${text(x.id)}`,
        body: (x) => ({ status: x.status === 'RESOLVED' ? 'CLOSED' : 'RESOLVED' }),
        hidden: (x) => x.status === 'CLOSED',
        anyOf: ['SUPPORT'],
      },
    ],
  },
  // Demand signal for restocking: which design, which size, and how many people
  // are waiting.
  'stock-requests': {
    title: 'Back-in-stock requests',
    description: 'Shoppers waiting on something that was sold out when they wanted it.',
    endpoint: '/admin/stock-notifications',
    collection: 'notifications',
    paginated: true,
    empty: {
      icon: Bell,
      title: 'No one is waiting',
      text: 'When a shopper asks to hear about a sold-out size, the request shows up here.',
    },
    columns: [
      {
        label: 'Product',
        value: (x) => text(nested(x, 'product').name),
        render: (x) => rowTitle(text(nested(x, 'product').name)),
        grow: true,
      },
      { label: 'Size SKU', value: (x) => text(nested(x, 'variant').sku) },
      { label: 'Email', value: (x) => text(x.email) },
      {
        label: 'In stock now',
        value: (x) => text((x.variant ? nested(x, 'variant') : nested(x, 'product')).quantity),
        align: 'right',
      },
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
        anyOf: ['SUPPORT'],
      },
    ],
  },
  brands: {
    title: 'Brands',
    description: 'Labels products are sold under. Each one gets its own storefront page.',
    endpoint: '/admin/brands',
    collection: 'brands',
    empty: {
      icon: Tags,
      title: 'No brands yet',
      text: 'Add a brand to give its products a storefront page of their own.',
    },
    columns: [
      {
        label: 'Brand',
        value: (x) => text(x.name),
        render: (x) => rowTitle(text(x.name)),
        grow: true,
      },
      { label: 'Slug', value: (x) => text(x.slug) },
      {
        label: 'Products',
        value: (x) => text(nested(x, '_count').products ?? 0),
        align: 'right',
      },
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
        label: 'Requests',
        value: (x) => text(Number(x.pendingAuthorizations) || ''),
        render: (x) =>
          Number(x.pendingAuthorizations) > 0
            ? badge('PENDING', `${text(x.pendingAuthorizations)} pending`)
            : '—',
      },
      {
        label: 'Shop',
        value: (x) => text(nested(x, 'ownerSeller').shopName ?? ''),
        render: (x) => text(nested(x, 'ownerSeller').shopName ?? '') || 'Platform',
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
        anyOf: ['MODERATOR'],
      },
      {
        label: () => 'Approve',
        path: (x) => `/admin/brands/${text(x.id)}/review`,
        body: () => ({ decision: 'approve' }),
        hidden: (x) => !x.status || x.status === 'APPROVED',
        anyOf: ['MODERATOR'],
      },
    ],
  },
  'brand-authorizations': {
    title: 'Brand authorisations',
    description:
      'Shops asking to sell under a brand, with the trademark certificate or reseller letter they sent.',
    endpoint: '/admin/brands/authorizations',
    collection: 'authorizations',
    statusParam: 'status',
    statusOptions: ['PENDING', 'APPROVED', 'REJECTED'],
    paginated: true,
    empty: {
      icon: Tags,
      title: 'No requests',
      text: 'When a seller asks to list under a brand, the request waits here for review.',
    },
    columns: [
      {
        label: 'Brand',
        value: (x) => text(authBrand(x).name),
        render: (x) => rowTitle(text(authBrand(x).name)),
        grow: true,
      },
      { label: 'Shop', value: (x) => text(authSeller(x).shopName) },
      {
        label: 'Basis',
        value: (x) =>
          x.authorizationType === 'TRADEMARK_OWNER'
            ? 'Owns the trademark'
            : x.authorizationType === 'AUTHORISED_RESELLER'
              ? 'Authorised reseller'
              : sentence(x.authorizationType),
      },
      statusColumn(),
      { label: 'Reason', value: (x) => text(x.rejectionReason) },
      { label: 'Asked', value: (x) => date(x.createdAt) },
    ],
    actions: [
      {
        label: () => 'Document',
        path: (x) =>
          `/admin/brands/${text(authBrand(x).id)}/authorization-doc?sellerId=${text(authSeller(x).id)}`,
        opensLink: true,
        hidden: (x) => !x.hasDocument,
        anyOf: ['MODERATOR'],
      },
      {
        label: () => 'Approve',
        path: (x) => `/admin/brands/${text(authBrand(x).id)}/review`,
        body: (x) => ({ decision: 'approve', sellerId: authSeller(x).id }),
        hidden: (x) => x.status === 'APPROVED',
        anyOf: ['MODERATOR'],
      },
      {
        label: () => 'Reject',
        path: (x) => `/admin/brands/${text(authBrand(x).id)}/review`,
        body: (x) => ({ decision: 'reject', sellerId: authSeller(x).id, reason: x.__note }),
        prompt: 'Why is this request being rejected? The seller will see this.',
        hidden: (x) => x.status === 'REJECTED',
        anyOf: ['MODERATOR'],
      },
    ],
  },
  newsletter: {
    title: 'Newsletter',
    description: 'Addresses collected from the footer and homepage sign-up forms.',
    endpoint: '/admin/newsletter-subscribers',
    collection: 'subscribers',
    paginated: true,
    statusParam: 'subscribed',
    statusOptions: ['true', 'false'],
    empty: {
      icon: Mail,
      title: 'No subscribers yet',
      text: 'Sign-ups from the footer and homepage forms are collected here.',
    },
    columns: [
      {
        label: 'Email',
        value: (x) => text(x.email),
        render: (x) => rowTitle(text(x.email)),
        grow: true,
      },
      { label: 'Source', value: (x) => sentence(x.source) },
      flagColumn('Status', (x) => x.isSubscribed, 'Subscribed', 'Unsubscribed'),
      { label: 'Signed up', value: (x) => date(x.createdAt) },
    ],
    actions: [
      {
        label: (x) => (x.isSubscribed ? 'Unsubscribe' : 'Re-subscribe'),
        path: (x) => `/admin/newsletter-subscribers/${text(x.id)}`,
        body: (x) => ({ isSubscribed: !x.isSubscribed }),
        anyOf: ['CONTENT', 'SUPPORT'],
      },
    ],
  },
};

/** Labels for the boolean filters some modules page on. */
export const filterLabel = (section: string, value: string): string => {
  if (section === 'reviews') return value === 'true' ? 'Published' : 'Hidden';
  if (section === 'newsletter') return value === 'true' ? 'Subscribed' : 'Unsubscribed';
  return statusLabel(value);
};
