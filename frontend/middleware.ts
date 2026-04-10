import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PROD_API_BASE } from "@/lib/productionConfig";

/**
 * Single Content-Security-Policy for the app. Next.js injects inline bootstrap/RSC
 * scripts — script-src must include 'unsafe-inline' (or nonces everywhere).
 *
 * Do not duplicate CSP in next.config headers(): multiple CSP policies are AND-ed
 * and a stricter one without unsafe-inline will block hydration.
 */
function cspForPath(pathname: string, isDev: boolean): string {
  if (isDev) {
    return [
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' http: https: blob:",
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: http: https: blob:",
      "font-src 'self' data: https:",
      "connect-src 'self' http: https: ws: wss:",
      "frame-src 'self' https:",
    ].join("; ");
  }

  if (pathname.startsWith("/pay/embed")) {
    return [
      "frame-ancestors *",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' 'inline-speculation-rules' https: blob:",
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data: https:",
      `connect-src 'self' ${PROD_API_BASE} https: wss:`,
      "frame-src 'self' https:",
    ].join("; ");
  }

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' 'inline-speculation-rules' https: blob:",
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data: https:",
    `connect-src 'self' ${PROD_API_BASE} https: wss:`,
    "frame-src 'self' https:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function middleware(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";
  const policy = cspForPath(request.nextUrl.pathname, isDev);
  const res = NextResponse.next();
  res.headers.set("Content-Security-Policy", policy);
  /** Vercel / Cloudflare / common proxies — anonymous currency hint for web (logged-in users override via phone). */
  const geo =
    request.headers.get("x-vercel-ip-country") ||
    request.headers.get("cf-ipcountry") ||
    request.headers.get("cloudfront-viewer-country") ||
    "";
  if (geo && /^[A-Z]{2}$/i.test(geo)) {
    res.cookies.set("geo_country", geo.toUpperCase(), {
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "lax",
    });
  }
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|woff2?)$).*)",
  ],
};
