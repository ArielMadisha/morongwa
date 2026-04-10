/**
 * Shared Open Graph / Twitter metadata for product URLs (WhatsApp, Facebook, iMessage).
 * Crawlers need absolute https og:image, title, description — client-only pages emit none.
 */
import type { Metadata } from "next";

type ProductDto = {
  _id?: string;
  title?: string;
  description?: string;
  images?: string[];
  price?: number;
  discountPrice?: number;
  currency?: string;
};

function apiUrl(): string {
  const env = String(process.env.NEXT_PUBLIC_API_URL || "").trim();
  if (env) return env.replace(/\/$/, "");
  return "https://api.qwertymates.com/api";
}

function apiBase(): string {
  return apiUrl().replace(/\/api\/?$/, "").replace(/\/$/, "");
}

/** Force https for OG crawlers (WhatsApp rejects http images). */
export function toAbsoluteOgImage(raw?: string): string | undefined {
  const val = String(raw || "").trim();
  if (!val) return undefined;
  let out: string;
  if (/^https:\/\//i.test(val)) out = val;
  else if (/^http:\/\//i.test(val)) out = val.replace(/^http:/i, "https:");
  else if (val.startsWith("/")) out = `${apiBase().replace(/^http:/i, "https:")}${val}`;
  else out = `https://${apiBase().replace(/^https?:\/\//i, "")}/${val.replace(/^\//, "")}`;
  return out;
}

function stripHtml(input?: string): string {
  return String(input || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function effectivePrice(p: ProductDto): number {
  const price = Number(p.price || 0);
  const d = p.discountPrice;
  if (d != null && Number.isFinite(d) && d >= 0 && d < price) return d;
  return price;
}

function formatPriceForDisplay(p: ProductDto, resellerCommissionPct?: number): string {
  const cur = String(p.currency || "USD").toUpperCase();
  const base = effectivePrice(p);
  const pct =
    resellerCommissionPct != null && Number.isFinite(resellerCommissionPct) ? Number(resellerCommissionPct) : 0;
  const sell = pct > 0 ? Math.round(base * (1 + pct / 100) * 100) / 100 : base;
  return `${cur} ${sell.toFixed(2)}`;
}

export async function fetchProductForOg(id: string): Promise<ProductDto | null> {
  const base = apiUrl();
  try {
    const res = await fetch(`${base}/products/${encodeURIComponent(id)}`, {
      next: { revalidate: 120 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const data = (json?.data ?? json) as ProductDto;
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

const SITE = "https://www.qwertymates.com";

/** Same-origin image URL for og:image — WhatsApp crawlers fetch this; route proxies supplier CDN. */
function ogProxyImageUrl(productId: string): string {
  const q = encodeURIComponent(productId);
  return `${SITE}/api/og-product-img?id=${q}`;
}

export type BuildProductMetadataOpts = {
  id: string;
  /** Path without domain, e.g. /share/product/abc or /marketplace/product/abc */
  path: string;
  resellerId?: string;
  resellerCommissionPct?: string;
};

export async function buildProductMetadata(opts: BuildProductMetadataOpts): Promise<Metadata> {
  const { id, path, resellerId, resellerCommissionPct } = opts;
  const p = await fetchProductForOg(id);
  const title = String(p?.title || "QwertyHub product");
  const descriptionRaw = stripHtml(p?.description) || "Buy on QwertyHub";
  /**
   * Always use same-origin /api/og-product-img — never raw supplier CDN in og:image.
   * WhatsApp/Facebook crawlers are often blocked by Alibaba/CDN; our route proxies with a normal UA.
   * Prefer MongoDB ObjectId in the query (short, stable); slug still works via GET /products/:slug.
   */
  const ogLookupKey =
    p?._id != null && /^[0-9a-fA-F]{24}$/.test(String(p._id).trim()) ? String(p._id).trim() : id;
  const image = ogProxyImageUrl(ogLookupKey);
  const resellerPct =
    resellerCommissionPct != null && resellerCommissionPct !== ""
      ? Number(resellerCommissionPct)
      : undefined;
  const priceLine = p ? formatPriceForDisplay(p, resellerPct) : "";
  const ogTitle = priceLine ? `${priceLine} · ${title}` : `Buy on QwertyHub: ${title}`;
  const ogDescription = priceLine
    ? `${priceLine} · ${descriptionRaw.slice(0, 120)}${descriptionRaw.length > 120 ? "…" : ""}`
    : descriptionRaw.slice(0, 200);

  const q = new URLSearchParams();
  if (resellerId) q.set("resellerId", String(resellerId));
  if (resellerCommissionPct != null && resellerCommissionPct !== "") {
    q.set("resellerCommissionPct", String(resellerCommissionPct));
  }
  const query = q.toString();
  const url = `${SITE}${path.startsWith("/") ? path : `/${path}`}${query ? `?${query}` : ""}`;

  return {
    metadataBase: new URL(SITE),
    title: ogTitle,
    description: ogDescription,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      type: "website",
      url,
      siteName: "Qwertymates",
      locale: "en_US",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: [image],
    },
    /** WhatsApp / Facebook crawlers often read these explicit og:image properties */
    other: {
      "og:image:secure_url": image,
      "og:image:width": "1200",
      "og:image:height": "630",
    },
  };
}
