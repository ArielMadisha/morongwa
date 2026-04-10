import { NextRequest, NextResponse } from "next/server";
import { PROD_API_BASE } from "@/lib/productionConfig";

/**
 * WhatsApp product cards use signed links. Backend generates URLs under FRONTEND_URL/wa/g/:token
 * so users see https://www.qwertymates.com/... instead of api.qwertymates.com.
 * This route forwards to the API redirect endpoint and returns the same Location (wa.me).
 */
function apiOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL || "").trim();
  if (raw) return raw.replace(/\/api\/?$/, "").replace(/\/$/, "");
  return process.env.NODE_ENV === "production" ? PROD_API_BASE : "http://localhost:4000";
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await context.params;
  const t = String(token || "").trim();
  if (t.length < 12) {
    return new NextResponse("Invalid link.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const upstream = `${apiOrigin()}/api/wa/g/${encodeURIComponent(t)}`;
  const res = await fetch(upstream, { redirect: "manual", cache: "no-store" });
  const loc = res.headers.get("location");
  if (res.status >= 300 && res.status < 400 && loc) {
    return NextResponse.redirect(loc, 302);
  }

  const text = await res.text().catch(() => "");
  return new NextResponse(text || "Invalid or expired link.", {
    status: res.status >= 400 ? res.status : 502,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
