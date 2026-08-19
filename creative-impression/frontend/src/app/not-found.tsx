import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="text-center">
        <p className="text-7xl font-extrabold text-primary-500">404</p>
        <h1 className="mt-4 text-2xl font-bold text-neutral-900">Page not found</h1>
        <p className="mt-2 text-neutral-600">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-primary-500 px-6 py-3 font-semibold text-black transition-colors hover:bg-primary-600"
          >
            Back to Home
          </Link>
          <Link
            href="/products"
            className="rounded-lg border border-neutral-300 px-6 py-3 font-semibold text-neutral-800 transition-colors hover:bg-neutral-50"
          >
            Shop Products
          </Link>
        </div>
      </div>
    </main>
  );
}
