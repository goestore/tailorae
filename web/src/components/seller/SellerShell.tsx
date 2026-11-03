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
  Wallet,
  type IconProps,
} from '@/components/admin/icons';
import { apiClient } from '@/lib/api-client';
import { getMyShop, type MyShop } from '@/lib/seller-api';
import type { AppDispatch, RootState } from '@/store';
import { logout } from '@/store/slices/auth';
import { clearCart } from '@/store/slices/cart';

interface NavItem {
  href: string;
  label: string;
  icon: React.FC<IconProps>;
}

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Shop',
    items: [
      { href: '/seller', label: 'Overview', icon: LayoutDashboard },
      { href: '/seller/orders', label: 'Orders', icon: ShoppingBag },
      { href: '/seller/earnings', label: 'Earnings', icon: Wallet },
    ],
  },
  {
    title: 'Catalogue',
    items: [
      { href: '/seller/products', label: 'Products', icon: Package },
      { href: '/seller/products/new', label: 'Add a product', icon: FileEdit },
      { href: '/seller/brands', label: 'Brands', icon: Tags },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/seller/verification', label: 'Verification', icon: ShieldCheck },
      { href: '/seller/settings', label: 'Shop settings', icon: Settings },
    ],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

/** The seller sign-in and sign-up pages: no console around them. */
export const SELLER_AUTH_ROUTES = new Set(['/seller/login', '/seller/register']);

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
 * for a visitor without a session.
 */
export function SellerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);
  const [shop, setShop] = useState<MyShop | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);

  const isAuthRoute = SELLER_AUTH_ROUTES.has(pathname);

  useEffect(() => {
    if (isAuthRoute || !isInitialized || user) return;
    router.replace(`/seller/login?redirect=${encodeURIComponent(pathname)}`);
  }, [isAuthRoute, isInitialized, user, pathname, router]);

  // Refetched per page so the name appears as soon as an application creates
  // the shop. A failure leaves the bar without a name; it never blocks a page.
  useEffect(() => {
    if (isAuthRoute || !user) return;
    let cancelled = false;
    getMyShop()
      .then((next) => !cancelled && setShop(next))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthRoute, user, pathname]);

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

  if (isAuthRoute) return <div className="seller-auth">{children}</div>;

  if (!isInitialized || !user) {
    return <LoadingSpinner className="min-h-screen" size="lg" />;
  }

  const signOut = async () => {
    await apiClient.post('/auth/logout').catch(() => {});
    localStorage.removeItem('token');
    dispatch(logout());
    dispatch(clearCart());
    router.push('/seller/login');
  };

  const current = activeHref(pathname);
  const initials = (shop?.shopName || user.firstName || 'S').trim().charAt(0).toUpperCase();

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
          {shop?.applicationStatus === 'APPROVED' && shop.shopSlug && (
            <Link href={`/sellers/${shop.shopSlug}`} target="_blank" className="seller-topbar-btn">
              <ExternalLink size={15} />
              <span className="seller-hide-sm">View shop</span>
            </Link>
          )}
          <div className="seller-account" title={user.email}>
            <span className="seller-avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="seller-account-name seller-hide-sm">
              <strong>{shop?.shopName || 'Your shop'}</strong>
              <span>
                {user.firstName} {user.lastName}
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
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="seller-nav-group" role="group" aria-label={group.title}>
                <p className="seller-nav-title">{group.title}</p>
                {group.items.map((item) => {
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
            ))}
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
          {children}
        </div>
      </div>
    </div>
  );
}
