'use client';

// Route-owned design system: foundation, semantic tokens, shell, components.
import './admin.css';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { signOut as endSession } from '@/lib/auth-api';
import {
  getStaffMe,
  PERMISSION_LABELS,
  permits,
  type StaffMember,
  type StaffPermission,
} from '@/lib/admin-staff';
import { StaffProvider } from '@/components/admin/StaffContext';
import {
  ADMIN_QUEUES_CHANGED,
  getQueueCounts,
  type AdminQueueCounts,
} from '@/lib/admin-moderation';
import { AppDispatch } from '@/store';
import { logout } from '@/store/slices/auth';
import { clearCart } from '@/store/slices/cart';
import {
  BarChart3,
  Bell,
  Boxes,
  ExternalLink,
  FileEdit,
  Home,
  LayoutDashboard,
  Mail,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tags,
  Ticket,
  Users,
  Wallet,
  type IconProps,
} from '@/components/admin/icons';
import { AREA_TONES, type Area } from '@/components/admin/tone';
import { Logo } from '@/components/common';

/**
 * The store's mark: the ringed tk on its own tile, then the wordmark — the
 * same artwork the storefront uses.
 */
function BrandMark({ size = 28, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <>
      <span
        className="admin-brand-tile"
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.29) }}
      >
        <Logo variant="mark" alt="" className="h-full" />
      </span>
      {wordmark && (
        <span className="admin-brand-word">
          <Logo alt="TAILORAE" className="h-[13px]" />
        </span>
      )}
    </>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: React.FC<IconProps>;
  /** Which review queue's size, if any, is shown beside the label. */
  queue?: keyof AdminQueueCounts;
  /**
   * Permissions the page's API calls accept (any one is enough; SUPER_ADMIN
   * always is). Left out: every staff member. An item the member cannot use is
   * not shown at all — the API would answer 403 to everything on it.
   */
  anyOf?: StaffPermission[];
}

/**
 * Navigation in groups, in the order work flows: catalogue, orders, the
 * marketplace, customers, then content. The flat list derived from it is the
 * single source of truth for route matching and the breadcrumb.
 */
const NAV_GROUPS: Array<{ title: string; area: Area; items: NavItem[] }> = [
  {
    title: 'Overview',
    area: 'overview',
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
      {
        href: '/admin/operations/analytics',
        label: 'Analytics',
        icon: BarChart3,
        anyOf: ['FINANCE', 'SUPPORT'],
      },
    ],
  },
  {
    title: 'Catalogue',
    area: 'catalogue',
    items: [
      { href: '/admin/products', label: 'Products', icon: Package, anyOf: ['MODERATOR'] },
      {
        href: '/admin/products/listing',
        label: 'Sheet listing',
        icon: Boxes,
        anyOf: ['MODERATOR'],
      },
      {
        href: '/admin/categories',
        label: 'Categories',
        icon: Boxes,
        anyOf: ['MODERATOR', 'CONTENT'],
      },
      {
        href: '/admin/operations/brands',
        label: 'Brands',
        icon: Tags,
        queue: 'brandsAwaitingReview',
        anyOf: ['MODERATOR'],
      },
      {
        href: '/admin/operations/inventory',
        label: 'Inventory',
        icon: Boxes,
        anyOf: ['MODERATOR', 'SUPPORT'],
      },
      {
        href: '/admin/moderation',
        label: 'Moderation',
        icon: ShieldCheck,
        queue: 'productsAwaitingModeration',
        anyOf: ['MODERATOR'],
      },
    ],
  },
  {
    title: 'Orders',
    area: 'orders',
    items: [
      {
        href: '/admin/operations/orders',
        label: 'Orders',
        icon: ShoppingBag,
        anyOf: ['SUPPORT', 'FINANCE'],
      },
      {
        href: '/admin/operations/returns',
        label: 'Returns',
        icon: RotateCcw,
        queue: 'returnsOpen',
        anyOf: ['SUPPORT'],
      },
      {
        href: '/admin/operations/exchanges',
        label: 'Exchanges',
        icon: RotateCcw,
        anyOf: ['SUPPORT'],
      },
      {
        href: '/admin/operations/cod',
        label: 'Cash on delivery',
        icon: Wallet,
        anyOf: ['SUPPORT', 'FINANCE'],
      },
      {
        href: '/admin/operations/coupons',
        label: 'Coupons',
        icon: Ticket,
        anyOf: ['FINANCE', 'CONTENT'],
      },
    ],
  },
  {
    title: 'Marketplace',
    area: 'marketplace',
    items: [
      {
        href: '/admin/sellers',
        label: 'Sellers',
        icon: Store,
        queue: 'sellersAwaitingReview',
        anyOf: ['KYC_REVIEW', 'SUPPORT', 'FINANCE'],
      },
      {
        href: '/admin/payouts',
        label: 'Payouts',
        icon: Wallet,
        queue: 'withdrawalsOpen',
        anyOf: ['FINANCE'],
      },
      {
        href: '/admin/b2b',
        label: 'B2B quotes',
        icon: Ticket,
        anyOf: ['SUPPORT', 'KYC_REVIEW', 'FINANCE'],
      },
      {
        href: '/admin/custom-wear',
        label: 'Custom Wear',
        icon: FileEdit,
        anyOf: ['CONTENT', 'SUPPORT'],
      },
      {
        href: '/admin/settings',
        label: 'Marketplace settings',
        icon: Settings,
        anyOf: ['FINANCE', 'KYC_REVIEW'],
      },
    ],
  },
  {
    title: 'Customers',
    area: 'customers',
    items: [
      {
        href: '/admin/operations/customers',
        label: 'Customers',
        icon: Users,
        anyOf: ['SUPPORT'],
      },
      { href: '/admin/operations/reviews', label: 'Reviews', icon: Bell, anyOf: ['MODERATOR'] },
      {
        href: '/admin/operations/stock-requests',
        label: 'Back-in-stock',
        icon: Bell,
        anyOf: ['SUPPORT'],
      },
      {
        href: '/admin/operations/newsletter',
        label: 'Newsletter',
        icon: Mail,
        anyOf: ['CONTENT', 'SUPPORT'],
      },
      {
        href: '/admin/operations/contact-requests',
        label: 'Queries',
        icon: Mail,
        anyOf: ['SUPPORT'],
      },
    ],
  },
  {
    title: 'Content',
    area: 'content',
    items: [
      { href: '/admin/content/home', label: 'Homepage', icon: Home, anyOf: ['CONTENT'] },
      { href: '/admin/content/brand', label: 'Brand', icon: FileEdit, anyOf: ['CONTENT'] },
      { href: '/admin/content/layout', label: 'Site layout', icon: Settings, anyOf: ['CONTENT'] },
      {
        href: '/admin/media',
        label: 'Media library',
        icon: Boxes,
        anyOf: ['CONTENT', 'MODERATOR'],
      },
      { href: '/admin/banners', label: 'Banners', icon: Home, anyOf: ['CONTENT'] },
      { href: '/admin/preview', label: 'Preview', icon: ExternalLink, anyOf: ['CONTENT'] },
    ],
  },
  {
    title: 'Settings',
    area: 'settings',
    items: [
      { href: '/admin/staff', label: 'Staff', icon: Users, anyOf: ['SUPER_ADMIN'] },
      { href: '/admin/audit', label: 'Audit log', icon: ShieldCheck, anyOf: ['SUPER_ADMIN'] },
    ],
  },
];

const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
const GROUP_OF = new Map(
  NAV_GROUPS.flatMap((group) => group.items.map((item) => [item.href, group.title]))
);

/** The last breadcrumb step for pages below a nav item. */
function subPageLabel(pathname: string, itemHref: string): string | null {
  if (pathname === itemHref) return null;
  const rest = pathname.slice(itemHref.length).replace(/^\//, '');
  if (!rest) return null;
  if (rest === 'new') return 'Add new';
  if (rest === 'import') return 'Import';
  // Record ids are UUIDs (36 characters with dashes).
  if (/^[a-z0-9-]{20,}$/i.test(rest.split('/')[0])) return 'Details';
  return rest
    .split('/')[0]
    .replace(/[-_]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

/** The staff sign-in page renders on its own, outside the console chrome. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/admin/login') return <>{children}</>;
  return <StaffGate>{children}</StaffGate>;
}

/**
 * Nothing in the console renders without a staff session. The probe is silent
 * — a 401 here is an answer, after one refresh attempt — and no session sends
 * the reader to the staff sign-in page with a way back to where they were.
 */
function StaffGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffMember | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void getStaffMe().then((member) => {
      if (cancelled) return;
      setStaff(member);
      if (!member) {
        const back = `${window.location.pathname}${window.location.search}`;
        router.replace(`/admin/login?redirect=${encodeURIComponent(back)}`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!staff) {
    return (
      <div
        className="admin-shell"
        style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}
      >
        <p className="admin-kpi-sub" role="status">
          {staff === null ? 'Taking you to sign in…' : 'Loading the console…'}
        </p>
      </div>
    );
  }

  return (
    <StaffProvider staff={staff}>
      <AdminConsole staff={staff}>{children}</AdminConsole>
    </StaffProvider>
  );
}

function AdminConsole({ children, staff }: { children: React.ReactNode; staff: StaffMember }) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const [collapsed, setCollapsed] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [queues, setQueues] = useState<AdminQueueCounts | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  /**
   * Longest match wins. Sorting by href length first stops `/admin` — a prefix
   * of every other entry — from claiming the highlight on every page.
   */
  /**
   * A detail page that lives outside its list's URL still belongs to that list
   * in the sidebar. `/admin/orders/:id` is reached from the orders table but
   * shares no prefix with `/admin/operations/orders`, so without this the
   * highlight fell back to Dashboard the moment an admin opened one order.
   */
  const NAV_ALIASES: Array<{ prefix: string; href: string }> = [
    { prefix: '/admin/orders', href: '/admin/operations/orders' },
    { prefix: '/admin/customers', href: '/admin/operations/customers' },
    { prefix: '/admin/operations/movements', href: '/admin/operations/inventory' },
    { prefix: '/admin/operations/brand-authorizations', href: '/admin/operations/brands' },
  ];

  const aliased = NAV_ALIASES.find((alias) => pathname.startsWith(alias.prefix))?.href ?? pathname;

  const activeItem = [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => aliased === item.href || aliased.startsWith(`${item.href}/`));

  /** The member's own menu: groups with nothing they can open are left out entirely. */
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => permits(staff.permissions, item.anyOf ?? [])),
  })).filter((group) => group.items.length > 0);

  /** A page the member's permissions do not cover: every call on it would be refused. */
  const isForbidden = Boolean(activeItem && !permits(staff.permissions, activeItem.anyOf ?? []));

  // Refreshed on every navigation and whenever a page decides a queue item. A
  // failure just leaves the badges off — the sidebar must never block on it.
  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      getQueueCounts()
        .then((counts) => !cancelled && setQueues(counts))
        .catch(() => {});
    void refresh();
    window.addEventListener(ADMIN_QUEUES_CHANGED, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(ADMIN_QUEUES_CHANGED, refresh);
    };
  }, [pathname]);

  useEffect(() => {
    const update = () => setIsCompact(window.innerWidth < 900);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Stop the page behind the drawer scrolling while it is open.
  useEffect(() => {
    if (!isCompact) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = mobileNavOpen ? 'hidden' : previous;
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isCompact, mobileNavOpen]);

  useEffect(() => {
    if (!isCompact || !mobileNavOpen) return;
    const sidebar = sidebarRef.current;
    const items = sidebar?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)');
    if (!items?.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    first.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
      if (event.key !== 'Tab') return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);

    // Captured now rather than read in the cleanup: focus has to return to the
    // button that opened the drawer, and by the time cleanup runs the ref may
    // already point somewhere else — which would send focus to the wrong
    // control, or nowhere, exactly when a keyboard user needs it back.
    const opener = menuRef.current;
    return () => {
      document.removeEventListener('keydown', handleKey);
      opener?.focus();
    };
  }, [isCompact, mobileNavOpen]);

  const signOut = async () => {
    await endSession('admin');
    // Clear the client store explicitly rather than relying on a full page
    // load to drop it — same sequence the account page signs out with.
    dispatch(logout());
    dispatch(clearCart());
    router.push('/admin/login');
  };

  const sidebarWidth = isCompact ? 280 : collapsed ? 64 : 240;
  const showLabels = isCompact || !collapsed;

  const [search, setSearch] = useState('');
  const runSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const term = search.trim();
    router.push(term ? `/admin/products?search=${encodeURIComponent(term)}` : '/admin/products');
  };

  const crumbs: Array<{ label: string; href?: string }> = [];
  if (activeItem) {
    const group = GROUP_OF.get(activeItem.href);
    const sub = subPageLabel(aliased === pathname ? pathname : aliased, activeItem.href);
    if (group && group !== 'Overview' && group !== activeItem.label) crumbs.push({ label: group });
    crumbs.push({ label: activeItem.label, href: sub ? activeItem.href : undefined });
    if (pathname.startsWith('/admin/orders/')) crumbs.push({ label: 'Order details' });
    else if (sub)
      crumbs.push({
        label: sub === 'Add new' && activeItem.href === '/admin/products' ? 'Add a product' : sub,
      });
  } else {
    crumbs.push({ label: 'Dashboard' });
  }

  return (
    <div className="admin-shell">
      <a href="#admin-main" className="admin-skip-link">
        Skip to content
      </a>

      {/* Top bar: full width, dark — logo, search, account. */}
      <header className="admin-topbar">
        <div className="admin-topbar-start">
          {isCompact && (
            <button
              ref={menuRef}
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open admin navigation"
              aria-expanded={mobileNavOpen}
              aria-controls="admin-navigation"
              className="admin-icon-btn"
            >
              <Menu size={18} strokeWidth={1.8} />
            </button>
          )}
          <Link href="/admin" className="admin-topbar-brand" aria-label="Admin home">
            <BrandMark size={28} wordmark />
          </Link>
        </div>

        {permits(staff.permissions, ['MODERATOR']) ? (
          <form role="search" onSubmit={runSearch} className="admin-topbar-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products and SKUs"
              aria-label="Search products"
            />
          </form>
        ) : (
          <span />
        )}

        <div className="admin-topbar-actions">
          <a href="/" target="_blank" rel="noopener noreferrer" className="admin-topbar-btn">
            <ExternalLink size={16} />
            {!isCompact && <span>Storefront</span>}
          </a>
          <div className="admin-account" title={`Signed in as ${staff.email}`}>
            <span className="admin-avatar admin-avatar--mark" aria-hidden="true">
              <Logo variant="mark" alt="" className="h-full" />
            </span>
            <span className="admin-account-name">
              <strong>{staff.fullName || 'Admin'}</strong>
              <span>
                {staff.permissions.includes('SUPER_ADMIN')
                  ? 'Super admin'
                  : staff.permissions
                      .map((permission) => PERMISSION_LABELS[permission]?.label ?? permission)
                      .join(', ')}
              </span>
            </span>
          </div>
          <button type="button" onClick={signOut} className="admin-topbar-btn">
            Log out
          </button>
        </div>
      </header>

      <div className="admin-body">
        {isCompact && mobileNavOpen && (
          <button
            type="button"
            aria-label="Close admin navigation"
            onClick={() => setMobileNavOpen(false)}
            className="admin-scrim"
          />
        )}

        <aside
          id="admin-navigation"
          ref={sidebarRef}
          inert={isCompact && !mobileNavOpen}
          className="admin-sidebar"
          style={{
            width: sidebarWidth,
            transition: 'width 0.2s ease, transform 0.2s ease',
            position: isCompact ? 'fixed' : 'relative',
            top: isCompact ? 56 : undefined,
            left: 0,
            bottom: isCompact ? 0 : undefined,
            zIndex: isCompact ? 30 : undefined,
            transform: isCompact && !mobileNavOpen ? 'translateX(-100%)' : 'translateX(0)',
            boxShadow: isCompact && mobileNavOpen ? 'var(--a-lift-3)' : 'none',
          }}
        >
          <nav className="admin-sidebar-nav" aria-label="Admin navigation">
            {visibleGroups.map((group) => (
              <div
                key={group.title}
                className="admin-nav-group"
                data-tone={AREA_TONES[group.area]}
                role="group"
                aria-label={group.title}
              >
                {showLabels ? (
                  <p className="admin-nav-group-title">{group.title}</p>
                ) : (
                  <div className="admin-nav-group-divider" aria-hidden="true" />
                )}
                {group.items.map((item) => {
                  const isActive = activeItem?.href === item.href;
                  const Icon = item.icon;
                  const count = item.queue && queues ? queues[item.queue] : 0;
                  const countLabel = count > 0 ? `${count} awaiting review` : '';
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      title={
                        !showLabels
                          ? [item.label, countLabel].filter(Boolean).join(' · ')
                          : undefined
                      }
                      // Closed on the click that navigates, so the drawer never
                      // sits open over the new page.
                      onClick={() => setMobileNavOpen(false)}
                      className={`admin-nav-link${isActive ? ' admin-nav-link--active' : ''}`}
                    >
                      <Icon size={18} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                      {showLabels && <span>{item.label}</span>}
                      {count > 0 && (
                        <span
                          className={`admin-nav-badge${showLabels ? '' : ' admin-nav-badge--dot'}`}
                        >
                          <span aria-hidden="true">{showLabels ? count : ''}</span>
                          <span className="sr-only">{countLabel}</span>
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="admin-sidebar-footer">
            <button
              type="button"
              className="admin-sidebar-toggle"
              onClick={() => (isCompact ? setMobileNavOpen(false) : setCollapsed(!collapsed))}
              aria-label={
                isCompact ? 'Close sidebar' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'
              }
            >
              {isCompact ? (
                <>
                  <PanelLeftClose size={18} /> Close
                </>
              ) : collapsed ? (
                <PanelLeftOpen size={18} />
              ) : (
                <>
                  <PanelLeftClose size={18} /> Collapse
                </>
              )}
            </button>
          </div>
        </aside>

        <div className="admin-main" inert={isCompact && mobileNavOpen}>
          <main id="admin-main" tabIndex={-1} className="admin-content">
            {/* Keyed on the route: a short rise on every navigation, single mount. */}
            <div key={pathname} className="admin-route">
              {crumbs.length > 1 && (
                <nav aria-label="Breadcrumb">
                  <ol className="admin-breadcrumb">
                    {crumbs.map((crumb, index) => {
                      const last = index === crumbs.length - 1;
                      return (
                        <li key={`${crumb.label}-${index}`}>
                          {crumb.href && !last ? (
                            <Link href={crumb.href}>{crumb.label}</Link>
                          ) : (
                            <span aria-current={last ? 'page' : undefined}>{crumb.label}</span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </nav>
              )}
              {isForbidden ? (
                <div className="admin-card" role="alert">
                  <p className="admin-kpi-label">No access</p>
                  <p className="admin-kpi-sub" style={{ marginTop: 6 }}>
                    Your account does not include the permission this page needs. Ask a super admin
                    to grant it.
                  </p>
                </div>
              ) : (
                children
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
