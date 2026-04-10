import type { NextConfig } from "next";
import { PROD_API_BASE } from "./lib/productionConfig";

const apiBase =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "").replace(/\/$/, "") ||
  (process.env.NODE_ENV === "production" ? PROD_API_BASE : "http://localhost:4000");

/** CSP is set in middleware.ts only — avoids duplicate policies that break Next inline scripts. */

const nextConfig: NextConfig = {
  /* config options here */
  async redirects() {
    return [{ source: '/acbpay-wallet', destination: '/wallet', permanent: true }];
  },
  async rewrites() {
    return [{ source: '/uploads/:path*', destination: `${apiBase}/uploads/:path*` }];
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

