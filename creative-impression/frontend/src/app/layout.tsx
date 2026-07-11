import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display, Montserrat } from 'next/font/google';
import '../styles/globals.css';
import { Providers } from '@/components/providers';
import { Header, Footer } from '@/components/layout';

const inter = Inter({ subsets: ['latin'] });
const playfairDisplay = Playfair_Display({ 
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-playfair'
});
const montserrat = Montserrat({ 
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-montserrat'
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

export const metadata: Metadata = {
  title: 'Creative Impression | Premium Fashion & Custom Apparel',
  description:
    'Shop premium fashion and custom apparel for B2B wholesale and B2C retail customers. Expert customization, fast delivery, and competitive pricing.',
  keywords:
    'fashion, custom apparel, wholesale, printing, embroidery, t-shirts, bulk orders',
  authors: [{ name: 'Creative Impression' }],
  robots: 'index, follow',
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://creativeimpression.com',
    siteName: 'Creative Impression',
    title: 'Creative Impression | Premium Fashion & Custom Apparel',
    description: 'Shop premium fashion and custom apparel',
    images: [
      {
        url: 'https://creativeimpression.com/og-image.jpg',
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Creative Impression',
    description: 'Premium Fashion & Custom Apparel Platform',
    images: ['https://creativeimpression.com/twitter-image.jpg'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${playfairDisplay.variable} ${montserrat.variable}`}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="x-ua-compatible" content="ie=edge" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1">
              {children}
            </main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
