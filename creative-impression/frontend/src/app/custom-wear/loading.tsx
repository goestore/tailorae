import { CustomWearThemeProvider } from '@/components/custom-wear';

const Block = ({ h, w = '100%' }: { h: number; w?: string }) => (
  <div className="animate-pulse" style={{ height: h, width: w, background: 'var(--cw-surface-alt)' }} />
);

/**
 * Shown while a Custom Wear route streams in — never a blank screen.
 *
 * Mirrors the browse layout it stands in for: title, category strip, filter
 * bar, then the grid. A skeleton shaped like a different page is worse than
 * none, because the content visibly jumps when it arrives.
 */
export default function CustomWearLoading() {
  return (
    <CustomWearThemeProvider>
      <div className="cw-browse">
        <div className="cw-browse-inner">
          <div className="mb-6 flex flex-col gap-3">
            <Block h={13} w="220px" />
            <Block h={38} w="min(420px, 70%)" />
            <Block h={14} w="min(560px, 90%)" />
          </div>

          <div className="mb-4 flex gap-2 overflow-hidden">
            {Array.from({ length: 6 }).map((_, index) => (
              <Block key={index} h={32} w="112px" />
            ))}
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            <Block h={40} w="min(260px, 100%)" />
            {Array.from({ length: 5 }).map((_, index) => (
              <Block key={index} h={40} w="104px" />
            ))}
          </div>

          <div className="cw-browse-grid">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="flex flex-col gap-2">
                <div
                  className="w-full animate-pulse"
                  style={{ aspectRatio: 'var(--card-ratio, 3 / 4)', background: 'var(--cw-surface-alt)' }}
                />
                <Block h={13} w="88%" />
                <Block h={13} w="46%" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </CustomWearThemeProvider>
  );
}
