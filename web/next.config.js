/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],

  // Image optimization. Deliberately NOT disabled in development: serving raw
  // sources locally makes dev slower than production and hides sizing mistakes.
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 's3.amazonaws.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Environment variables
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
  },

  // Redirects
  redirects: async () => {
    return [
      {
        source: '/shop',
        destination: '/products',
        permanent: true,
      },
    ];
  },

  // Rewrites - only if API URL is set
  rewrites: async () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) return [];

    // NEXT_PUBLIC_API_URL may already end in /api — strip it so the
    // rewrite doesn't produce a double /api/api/* path
    const base = apiUrl.replace(/\/api\/?$/, '');
    return [
      {
        source: '/api/:path*',
        destination: `${base}/api/:path*`,
      },
      // Uploaded images are stored by the backend, but the storefront refers to
      // them by plain relative path so a stored value never carries a hostname
      // that would go stale when the API moves.
      {
        source: '/uploads/:path*',
        destination: `${base}/uploads/:path*`,
      },
    ];
  },

  // Headers
  headers: async () => {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Same-origin framing only: the admin's storefront preview (/admin/preview)
          // embeds the storefront in an iframe. Other origins stay blocked.
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self'",
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },

  turbopack: {
    root: __dirname,
  },

  compress: true,
  productionBrowserSourceMaps: false,

  // Trailing slash
  trailingSlash: false,

  // TypeScript
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
};

module.exports = nextConfig;
