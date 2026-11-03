import Link from 'next/link';
import { Logo } from '@/components/common';

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="max-w-md border border-line bg-white p-8 text-center md:p-12">
        <Logo variant="mark" alt="" className="mx-auto h-16" />
        <p className="mt-5 text-caption font-bold uppercase tracking-[0.14em] text-[var(--brand-700)]">
          Error 404
        </p>
        <h1 className="mt-2 text-2xl text-ink">Page not found</h1>
        <p className="mt-2 text-ink-3">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="bg-[var(--brand)] px-6 py-3 text-ink transition-colors hover:bg-[#ffe04d]"
          >
            Back to Home
          </Link>
          <Link
            href="/products"
            className="border border-line px-6 py-3 text-ink transition-colors hover:bg-surface-2"
          >
            Shop Products
          </Link>
        </div>
      </div>
    </main>
  );
}
