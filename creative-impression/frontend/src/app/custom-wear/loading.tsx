import { CustomWearThemeProvider, ProductGridSkeleton } from '@/components/custom-wear';

/** Shown while a Custom Wear route streams in — never a blank screen. */
export default function CustomWearLoading() {
  return (
    <CustomWearThemeProvider>
      <div
        className="w-full animate-pulse"
        style={{ height: '340px', backgroundColor: 'var(--cw-surface-alt)' }}
      />
      <div
        className="mx-auto w-full px-4 py-8 sm:px-6 lg:px-10"
        style={{ maxWidth: 'var(--cw-content-max)' }}
      >
        <div className="flex gap-8">
          <div className="hidden flex-col gap-4 lg:flex" style={{ width: 'var(--cw-sidebar-width)' }}>
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="animate-pulse rounded"
                style={{ height: index === 0 ? 180 : 60, backgroundColor: 'var(--cw-surface-alt)' }}
              />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="mb-6 animate-pulse rounded"
              style={{ height: 56, width: '40%', backgroundColor: 'var(--cw-surface-alt)' }}
            />
            <ProductGridSkeleton count={8} />
          </div>
        </div>
      </div>
    </CustomWearThemeProvider>
  );
}
