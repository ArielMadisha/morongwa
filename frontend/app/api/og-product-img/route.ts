import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

function apiUrl(): string {
  const env = String(process.env.NEXT_PUBLIC_API_URL || "").trim();
  if (env) return env.replace(/\/$/, "");
  return "https://api.qwertymates.com/api";
}

function toAbsoluteImageUrl(raw: string, apiBase: string): string {
  const val = String(raw || "").trim();
  if (!val) return "";
  if (/^https:\/\//i.test(val)) return val;
  if (/^http:\/\//i.test(val)) return val.replace(/^http:/i, "https:");
  const base = apiBase.replace(/\/$/, "");
  if (val.startsWith("/")) return `${base}${val}`;
  return `${base}/${val.replace(/^\//, "")}`;
}

const MAX_BYTES = 6 * 1024 * 1024;

async function respondWithLocalLogo(): Promise<NextResponse> {
  try {
    const filePath = path.join(process.cwd(), "public", "qwertymates-logo-icon.png");
    const buf = await readFile(filePath);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

/**
 * Proxies the product's first image through www.qwertymates.com so WhatsApp / Facebook
 * crawlers can load og:image (many supplier CDNs block or throttle link-preview bots).
 * Always returns 200 + image bytes when possible — WhatsApp often ignores redirects on og:image.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || id.length > 600) {
    return respondWithLocalLogo();
  }

  const base = apiUrl();
  const apiBase = base.replace(/\/api\/?$/, "").replace(/\/$/, "");

  let product: { images?: string[] } | null = null;
  try {
    const pr = await fetch(`${base}/products/${encodeURIComponent(id)}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!pr.ok) throw new Error("product");
    const json = await pr.json();
    product = (json?.data ?? json) as { images?: string[] };
  } catch {
    return respondWithLocalLogo();
  }

  const rawImg = Array.isArray(product?.images) ? product.images[0] : null;
  const imgUrl = rawImg ? toAbsoluteImageUrl(String(rawImg), apiBase) : "";
  if (!imgUrl) {
    return respondWithLocalLogo();
  }

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 15000);
  try {
    const ir = await fetch(imgUrl, {
      headers: {
        "User-Agent": "QwertyHub-LinkPreview/1.0",
        Accept: "image/*,*/*",
      },
      signal: ac.signal,
    });
    clearTimeout(timeout);
    if (!ir.ok) throw new Error("img");
    const len = ir.headers.get("content-length");
    if (len && Number(len) > MAX_BYTES) throw new Error("too big");
    const buf = await ir.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error("too big");
    const ct = ir.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) throw new Error("not image");
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch {
    clearTimeout(timeout);
    return respondWithLocalLogo();
  }
}
