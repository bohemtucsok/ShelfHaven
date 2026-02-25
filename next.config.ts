import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import createNextIntlPlugin from "next-intl/plugin";

const isProd = process.env.NODE_ENV === "production";
const publicDomain = process.env.NEXTAUTH_URL || "http://localhost:3000";

// In dev: direct MinIO access; in prod: covers proxied through /api/books/[id]/cover
const minioCsp = isProd ? "" : "http://localhost:9000 http://minio:9000";

const withPWA = withPWAInit({
  dest: "public",
  disable: !isProd,
  register: true,
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
      {
        // Cover images served via proxy: /api/books/[id]/cover
        urlPattern: /\/api\/books\/[^/]+\/cover/,
        handler: "CacheFirst",
        options: {
          cacheName: "book-covers",
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        // Book list API
        urlPattern: /\/api\/books(\?|$)/,
        handler: "NetworkFirst",
        options: {
          cacheName: "book-list-api",
          networkTimeoutSeconds: 3,
          expiration: { maxAgeSeconds: 5 * 60 }, // 5 minutes
        },
      },
      {
        // Categories API
        urlPattern: /\/api\/categories/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "categories-api",
          expiration: { maxAgeSeconds: 60 * 60 }, // 1 hour
        },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  productionBrowserSourceMaps: false,
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "9000",
        pathname: "/covers/**",
      },
      {
        protocol: "http",
        hostname: "minio",
        port: "9000",
        pathname: "/covers/**",
      },
      {
        protocol: "https",
        hostname: "books.google.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "hardcover.app",
      },
      {
        protocol: "https",
        hostname: "*.hardcover.app",
      },
      {
        protocol: "https",
        hostname: "www.gravatar.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }] : []),
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' ${isProd ? "" : "'unsafe-eval'"} 'unsafe-inline'; style-src 'self' 'unsafe-inline' blob:; style-src-elem 'self' 'unsafe-inline' blob:; img-src 'self' data: blob: ${minioCsp} https://books.google.com https://*.googleusercontent.com https://*.hardcover.app https://www.gravatar.com; font-src 'self' data: blob:; connect-src 'self' ${minioCsp} https://www.googleapis.com https://api.hardcover.app; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`.replace(/\s+/g, " ").trim(),
          },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(withPWA(nextConfig));
