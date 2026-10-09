'use client';

// Route-owned design system: foundation, semantic tokens, shell, components.
import './admin.css';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { apiClient } from '@/lib/api-client';
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

/**
 * The store's mark in the 9 Impression sidebar idiom: the logo on its own
 * white tile, then the name. Same file the storefront header uses.
 */
function BrandMark({ size = 28, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <>
      <span
        className="admin-brand-tile"
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.29) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/IX%20Logo.JPG" alt="" width={size} height={size} />
      </span>
      {wordmark && <span className="admin-brand-word">Creative Impression</span>}
    </>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: React.FC<IconProps>;
  /** Which review queue's size, if any, is shown beside the label. */
  queue?: keyof AdminQueueCounts;
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
      { href: '/admin/operations/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Catalogue',
    area: 'catalogue',
    items: [
      { href: '/admin/products', label: 'Products', icon: Package },
      { href: '/admin/products/listing', label: 'Sheet listing', icon: Boxes },
      { href: '/admin/categories', label: 'Categories', icon: Boxes },
      { href: '/admin/operations/brands', label: 'Brands', icon: Tags },
      { href: '/admin/operations/inventory', label: 'Inventory', icon: Boxes },
      {
        href: '/admin/moderation',
        label: 'Moderation',
        icon: ShieldCheck,
        queue: 'productsAwaitingModeration',
      },
    ],
  },
  {
    title: 'Orders',
    area: 'orders',
    items: [
      { href: '/admin/operations/orders', label: 'Orders', icon: ShoppingBag },
      { href: '/admin/operations/returns', label: 'Returns', icon: RotateCcw },
      { href: '/admin/operations/exchanges', label: 'Exchanges', icon: RotateCcw },
      { href: '/admin/operations/cod', label: 'Cash on delivery', icon: Wallet },
      { href: '/admin/operations/coupons', label: 'Coupons', icon: Ticket },
    ],
  },
  {
    title: 'Marketplace',
    area: 'marketplace',
    items: [
      { href: '/admin/sellers', label: 'Sellers', icon: Store, queue: 'sellersAwaitingKyc' },
      { href: '/admin/payouts', label: 'Payouts', icon: Wallet },
      { href: '/admin/b2b', label: 'B2B quotes', icon: Ticket },
      { href: '/admin/custom-wear', label: 'Custom Wear', icon: FileEdit },
      { href: '/admin/settings', label: 'Marketplace settings', icon: Settings },
    ],
  },
  {
    title: 'Customers',
    area: 'customers',
    items: [
      { href: '/admin/operations/customers', label: 'Customers', icon: Users },
      { href: '/admin/operations/reviews', label: 'Reviews', icon: Bell },
      { href: '/admin/operations/stock-requests', label: 'Back-in-stock', icon: Bell },
      { href: '/admin/operations/newsletter', label: 'Newsletter', icon: Mail },
      { href: '/admin/operations/contact-requests', label: 'Queries', icon: Mail },
    ],
  },
  {
    title: 'Content',
    area: 'content',
    items: [
      { href: '/admin/content/home', label: 'Homepage', icon: Home },
      { href: '/admin/content/brand', label: 'Brand', icon: FileEdit },
      { href: '/admin/content/layout', label: 'Site layout', icon: Settings },
      { href: '/admin/preview', label: 'Preview', icon: ExternalLink },
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
  if (/^[a-z0-9]{20,}$/i.test(rest.split('/')[0])) return 'Details';
  return rest
    .split('/')[0]
    .replace(/[-_]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
  ];

  const aliased = NAV_ALIASES.find((alias) => pathname.startsWith(alias.prefix))?.href ?? pathname;

  const activeItem = [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => aliased === item.href || aliased.startsWith(`${item.href}/`));

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
    await apiClient.post('/auth/logout').catch(() => {});
    localStorage.removeItem('token');
    // Clear the client store explicitly rather than relying on a full page
    // load to drop it — same sequence the account page signs out with.
    dispatch(logout());
    dispatch(clearCart());
    router.push('/auth/login');
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

        <div className="admin-topbar-actions">
          <a href="/" target="_blank" rel="noopener noreferrer" className="admin-topbar-btn">
            <ExternalLink size={16} />
            {!isCompact && <span>Storefront</span>}
          </a>
          <div className="admin-account" title="Signed in as admin">
            <span className="admin-avatar" aria-hidden="true">
              CI
            </span>
            <span className="admin-account-name">
              <strong>Admin</strong>
              <span>Creative Impression</span>
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
            {NAV_GROUPS.map((group) => (
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
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
