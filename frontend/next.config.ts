import type { NextConfig } from "next";

const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, '') || 'http://localhost:4000';

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
  allowedDevOrigins: ["172.23.224.1", "172.236.181.129", "localhost"],
  
  // Add security headers with proper CSP
  async headers() {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    if (isDevelopment) {
      // Permissive CSP in dev so app scripts and chunks (e.g. from localhost) load
      // even when a browser extension injects a stricter CSP
      return [
        {
          source: "/:path*",
          headers: [
            {
              key: "Content-Security-Policy",
              value: "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' http: https: blob:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: http: https: blob:; font-src 'self' data: https:; connect-src 'self' http: https: ws: wss:; frame-src 'self' https:;",
            },
          ],
        },
      ];
    }
    
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "script-src 'self' 'wasm-unsafe-eval' 'inline-speculation-rules' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-src 'self' https:;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

