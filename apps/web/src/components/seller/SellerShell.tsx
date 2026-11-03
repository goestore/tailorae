'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { Logo, LoadingSpinner } from '@/components/common';
import {
  ExternalLink,
  FileEdit,
  LayoutDashboard,
  Menu,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Tags,
  Users,
  Wallet,
  type IconProps,
} from '@/components/admin/icons';
import { signOut as endSession } from '@/lib/auth-api';
import { ROLE_LABELS, setActiveSeller, type SellerPermission } from '@/lib/seller-api';
import type { AppDispatch, RootState } from '@/store';
import { logout } from '@/store/slices/auth';
import { clearCart } from '@/store/slices/cart';
import { SellerProvider, useSeller } from './SellerContext';

interface NavItem {
  href: string;
  label: string;
  icon: React.FC<IconProps>;
  /** Hidden from a member whose role cannot use the page (the API refuses it anyway). */
  needs?: SellerPermission;
  /** Only once the person belongs to a shop. */
  needsShop?: boolean;
}

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Shop',
    items: [
      { href: '/seller', label: 'Overview', icon: LayoutDashboard },
      { href: '/seller/orders', label: 'Orders', icon: ShoppingBag, needs: 'ORDERS' },
      { href: '/seller/earnings', label: 'Earnings', icon: Wallet, needs: 'FINANCE' },
    ],
  },
  {
    title: 'Catalogue',
    items: [
      { href: '/seller/products', label: 'Products', icon: Package, needs: 'CATALOG' },
      { href: '/seller/products/new', label: 'Add a product', icon: FileEdit, needs: 'CATALOG' },
      { href: '/seller/brands', label: 'Brands', icon: Tags, needs: 'CATALOG' },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/seller/verification', label: 'Verification', icon: ShieldCheck, needs: 'PROFILE' },
      { href: '/seller/settings', label: 'Shop settings', icon: Settings, needsShop: true },
      { href: '/seller/team', label: 'Team', icon: Users, needsShop: true },
    ],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

/** The seller sign-in and sign-up pages: no console around them. */
export const SELLER_AUTH_ROUTES = new Set([
  '/seller/login',
  '/seller/register',
  '/seller/forgot-password',
  '/seller/reset-password',
  // Accepting an invite works signed in or out, so it has no console around it.
  '/seller/invite',
]);

/**
 * Longest match wins, so `/seller` — a prefix of every route — only lights up
 * on the overview itself, and an edit page highlights Products, not Add.
 */
function activeHref(pathname: string): string | undefined {
  return [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.href;
}

/**
 * The seller console: its own top bar and sidebar, deliberately apart from the
 * storefront chrome so a shop owner always knows which side of the marketplace
 * they are on. The console also owns the sign-in gate, so a page never renders
 * for a visitor without a session, and it reads `GET /seller/me` once for every
 * page (see `SellerContext`).
 */
export function SellerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);

  const isAuthRoute = SELLER_AUTH_ROUTES.has(pathname);

  useEffect(() => {
    if (isAuthRoute || !isInitialized || user) return;
    router.replace(`/seller/login?redirect=${encodeURIComponent(pathname)}`);
  }, [isAuthRoute, isInitialized, user, pathname, router]);

  if (isAuthRoute) return <div className="seller-auth">{children}</div>;

  if (!isInitialized || !user) {
    return <LoadingSpinner className="min-h-screen" size="lg" />;
  }

  return (
    <SellerProvider key={user.id} enabled>
      <Console>{children}</Console>
    </SellerProvider>
  );
}

function Console({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((state: RootState) => state.auth.user);
  const { me, loading, error, activeSellerId, can, switchShop } = useSeller();
  const [navOpen, setNavOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!navOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setNavOpen(false);
    document.addEventListener('keydown', onKey);
    const opener = menuRef.current;
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [navOpen]);

  const signOut = async () => {
    await endSession('seller');
    // The shop choice belongs to this person; the next one starts fresh.
    setActiveSeller(null);
    dispatch(logout());
    dispatch(clearCart());
    router.push('/seller/login');
  };

  const shop = me?.shop ?? null;
  const memberships = me?.memberships ?? [];
  const current = activeHref(pathname);
  const initials = (shop?.shopName || user?.firstName || 'S').trim().charAt(0).toUpperCase();
  // Before the business exists there is only the overview, where it is created.
  const visible = (item: NavItem) =>
    (!item.needs && !item.needsShop) || Boolean(shop && (!item.needs || can(item.needs)));

  return (
    <div className="seller-shell" data-nav-open={navOpen || undefined}>
      <a href="#seller-main" className="skip-link">
        Skip to content
      </a>

      <header className="seller-topbar">
        <button
          ref={menuRef}
          type="button"
          className="seller-icon-btn seller-menu-btn"
          onClick={() => setNavOpen(true)}
          aria-label="Open seller navigation"
          aria-expanded={navOpen}
          aria-controls="seller-navigation"
        >
          <Menu size={18} strokeWidth={1.8} />
        </button>

        <Link href="/seller" className="seller-brand" aria-label="Seller Central home">
          <span className="seller-brand-tile">
            <Logo variant="mark" alt="" className="h-full" />
          </span>
          <Logo alt="TAILORAE" className="seller-brand-word h-[12px]" />
          <span className="seller-brand-tag">Seller Central</span>
        </Link>

        <div className="seller-topbar-actions">
          {shop?.status === 'APPROVED' && shop.shopSlug && (
            <Link href={`/sellers/${shop.shopSlug}`} target="_blank" className="seller-topbar-btn">
              <ExternalLink size={15} />
              <span className="seller-hide-sm">View shop</span>
            </Link>
          )}
          {memberships.length > 1 && (
            <label className="seller-switcher">
              <span className="sr-only">Shop</span>
              <select
                value={activeSellerId ?? ''}
                onChange={(event) => void switchShop(event.target.value)}
                className="seller-topbar-btn"
                aria-label="Switch shop"
              >
                {memberships.map((m) => (
                  <option key={m.sellerId} value={m.sellerId}>
                    {m.shopName} · {ROLE_LABELS[m.role]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="seller-account" title={user?.email}>
            <span className="seller-avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="seller-account-name seller-hide-sm">
              <strong>{shop?.shopName || 'Your shop'}</strong>
              <span>
                {user?.name || `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()}
                {me?.role ? ` · ${ROLE_LABELS[me.role]}` : ''}
              </span>
            </span>
          </div>
          <button type="button" onClick={signOut} className="seller-topbar-btn">
            Sign out
          </button>
        </div>
      </header>

      <div className="seller-body">
        {navOpen && (
          <button
            type="button"
            className="seller-scrim"
            aria-label="Close seller navigation"
            onClick={() => setNavOpen(false)}
          />
        )}

        <aside id="seller-navigation" className="seller-sidebar">
          <nav aria-label="Seller navigation">
            {NAV_GROUPS.map((group) => {
              const items = group.items.filter(visible);
              if (!items.length) return null;
              return (
                <div key={group.title} className="seller-nav-group" role="group" aria-label={group.title}>
                  <p className="seller-nav-title">{group.title}</p>
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = current === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => setNavOpen(false)}
                        className={`seller-nav-link${isActive ? ' seller-nav-link--active' : ''}`}
                      >
                        <Icon size={17} strokeWidth={1.8} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          <div className="seller-sidebar-foot">
            <Link href="/info/contact" onClick={() => setNavOpen(false)}>
              Seller support
            </Link>
            <Link href="/" onClick={() => setNavOpen(false)}>
              Back to the shop
            </Link>
          </div>
        </aside>

        <div id="seller-main" className="seller-main" tabIndex={-1}>
          {error && (
            <p role="alert" className="alert alert-error m-4 text-sm">
              {error}
            </p>
          )}
          {loading ? (
            <LoadingSpinner className="min-h-[50vh]" size="lg" />
          ) : (
            // Keyed by shop: switching shops remounts the page, so nothing read
            // for the previous shop is shown under the new one's name.
            <React.Fragment key={activeSellerId ?? 'none'}>{children}</React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}
