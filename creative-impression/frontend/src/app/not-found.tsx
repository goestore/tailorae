import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="max-w-md border border-line bg-white p-8 text-center md:p-12">
        <p className="text-6xl text-[var(--brand-700)]">404</p>
        <h1 className="mt-4 text-2xl text-ink">Page not found</h1>
        <p className="mt-2 text-ink-3">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="bg-[var(--brand)] px-6 py-3 text-ink transition-colors hover:bg-[#ffd24a]"
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
