import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CustomWearThemeProvider } from '@/components/custom-wear';
import { QuoteStatusView } from '@/components/custom-wear/QuoteStatusView';

export const metadata: Metadata = {
  title: 'My custom wear quotes | Creative Impression',
  description: 'Track your custom printed and embroidered garment quote requests.',
  robots: { index: false },
};

export default function CustomWearQuotesPage() {
  return (
    <CustomWearThemeProvider>
      {/* useSearchParams (reference + email from the confirmation link) needs a boundary. */}
      <Suspense fallback={null}>
        <QuoteStatusView />
      </Suspense>
    </CustomWearThemeProvider>
  );
}
