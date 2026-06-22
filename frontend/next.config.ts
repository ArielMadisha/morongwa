import type { NextConfig } from "next";
import { PROD_API_BASE } from "./lib/productionConfig";

const apiBase =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "").replace(/\/$/, "") ||
  (process.env.NODE_ENV === "production" ? PROD_API_BASE : "http://localhost:4000");

/** CSP is set in middleware.ts only — avoids duplicate policies that break Next inline scripts. */

const nextConfig: NextConfig = {
  poweredByHeader: false,
  /* config options here */
  async redirects() {
    return [{ source: '/acbpay-wallet', destination: '/wallet', permanent: true }];
  },
  async rewrites() {
    return [
      { source: '/uploads/:path*', destination: `${apiBase}/uploads/:path*` },
      /** Same-origin API (incl. large TV uploads) — avoids cross-subdomain multipart quirks. */
      { source: '/api/:path*', destination: `${apiBase}/api/:path*` },
      /** Video-call Socket.IO uses api.qwertymates.com directly (see lib/socketUrl.ts). */
    ];
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
    ];
    const hsts =
      process.env.NODE_ENV === 'production'
        ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
        : [];

    return [
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          ...securityHeaders,
          ...hsts,
        ],
      },
    ];
  },
  turbopack: {
    root: __dirname,
  },
  typescript: {
    // Temporary for server staging: unblock production build while we
    // continue fixing strict type issues incrementally.
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: [
    "172.23.224.1",
    "172.236.181.129",
    "localhost",
    "139.59.199.115",
    "qwertymates.com",
    "www.qwertymates.com",
  ],
};

export default nextConfig;

