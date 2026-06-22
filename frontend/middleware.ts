import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PROD_API_BASE } from "@/lib/productionConfig";

/**
 * Budget tablets (e.g. JTY K108 / Spreadtrum, Android 7–10) ship with old Chrome
 * WebView that cannot run Next.js 16 / React 19. Redirect to a static page.
 */
function isLegacyTabletBrowser(ua: string): boolean {
  if (!ua) return false;
  const chrome = ua.match(/Chrome\/(\d+)/i);
  const chromeMajor = chrome ? parseInt(chrome[1], 10) : 0;
  const android = ua.match(/Android (\d+)/i);
  const androidMajor = android ? parseInt(android[1], 10) : 0;

  if (chromeMajor > 0 && chromeMajor < 90) return true;
  if (androidMajor > 0 && androidMajor <= 10 && chromeMajor > 0 && chromeMajor < 100) return true;
  if (/Spreadtrum|SC7731|JTY[\s_-]?K108/i.test(ua)) return true;
  return false;
}

/**
 * Single Content-Security-Policy for the app. Next.js injects inline bootstrap/RSC
 * scripts — script-src must include 'unsafe-inline' (or nonces everywhere).
 */
function cspForPath(pathname: string, isDev: boolean): string {
  if (isDev) {
    return [
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' http: https: blob:",
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: http: https: blob:",
      "media-src 'self' http: https: blob:",
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
      `media-src 'self' ${PROD_API_BASE} https: blob:`,
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
    `media-src 'self' ${PROD_API_BASE} https: blob:`,
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
  const pathname = request.nextUrl.pathname;
  const ua = request.headers.get("user-agent") || "";

  if (
    request.nextUrl.searchParams.get("full") !== "1" &&
    isLegacyTabletBrowser(ua) &&
    !pathname.startsWith("/legacy/") &&
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/_next/")
  ) {
    const legacy = request.nextUrl.clone();
    legacy.pathname = "/legacy/tablet.html";
    return NextResponse.redirect(legacy);
  }

  const isDev = process.env.NODE_ENV !== "production";
  const policy = cspForPath(pathname, isDev);
  const res = NextResponse.next();
  res.headers.set("Content-Security-Policy", policy);
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
    "/((?!_next/static|_next/image|favicon.ico|legacy/|api/|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|woff2?|html)$).*)",
  ],
};
