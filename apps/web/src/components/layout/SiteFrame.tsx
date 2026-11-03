'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import type { StoreCategory } from '@/lib/category-tree';

type Announcement = {
  enabled: boolean;
  message: string;
  scroll: boolean;
  speedSeconds: number;
};

const LANDING_ROUTES = new Set(['/sell']);

/** Keeps management tools deliberately separate from the customer storefront. */
export function SiteFrame({
  children,
  announcement,
  categories,
}: {
  children: ReactNode;
  announcement?: Announcement;
  /** Active category tree for the header's departments; null keeps the static menu. */
  categories?: StoreCategory[] | null;
}) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');
  // `/seller` and below only: `/sell` (the landing page) and `/sellers` (the
  // public shop directory) are storefront pages.
  const isSellerConsole = pathname === '/seller' || pathname.startsWith('/seller/');

  // The admin and seller route groups own their shells (admin/layout.tsx,
  // seller/layout.tsx), which bring the sidebar, topbar and stylesheet with
  // them. This used to render that chrome here, which meant a storefront
  // component held the console layout and both had to agree about it.
  if (isAdmin || isSellerConsole) return <>{children}</>;

  // Campaign landing pages bring their own slim header (logo + CTA) so the
  // visitor is not pulled away into the shop nav; they keep the footer.
  if (LANDING_ROUTES.has(pathname)) {
    return (
      <div className="min-h-screen flex flex-col">
        <div id="main-content" className="flex-1" tabIndex={-1}>
          {children}
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header announcement={announcement} categories={categories} />
      <div id="main-content" className="flex-1" tabIndex={-1}>
        {children}
      </div>
      <Footer />
    </div>
  );
}
