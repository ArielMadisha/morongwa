import Product from "../data/models/Product";
import {
  debugFacebookAccessToken,
  formatFacebookGraphError,
  missingFacebookPublishScopes,
  publishFacebookPageFeedPost,
  publishFacebookPagePhotoPost,
} from "./facebookGraphApi";
import { isProductPubliclyListable } from "./publicProductListing";

const DEFAULT_PAGE_ID = "427972753928205"; // Qwertymates managed Page (not profile URL id)
const PRODUCTION_SITE_ORIGIN = "https://www.qwertymates.com";

/** Known marketplace publish targets (managed Pages under the owner's Facebook account). */
export const FACEBOOK_MARKETPLACE_PAGES = {
  qwertymates: {
    key: "qwertymates",
    name: "Qwertymates",
    pageId: "427972753928205",
    nameHints: ["qwertymates"],
  },
  buyafrika: {
    key: "buyafrika",
    name: "BuyAfrika",
    pageId: "104790967934453",
    nameHints: ["buyafrika", "buy afrika"],
  },
  /** User sometimes types Bmeida.Online / Bmeida.Onlie — real Page name is BMedia.Online */
  bmeida: {
    key: "bmeida",
    name: "BMedia.Online",
    pageId: "101382291537671",
    nameHints: ["bmedia.online", "bmeida.online", "bmeida.onlie", "bmeida", "bmedia"],
  },
} as const;

export type FacebookMarketplacePageKey = keyof typeof FACEBOOK_MARKETPLACE_PAGES;

function isLocalDevUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url);
}

/** Public shop links in Facebook posts must never point at localhost. */
function siteOrigin(): string {
  const explicit = (process.env.FACEBOOK_MARKETPLACE_SITE_URL || process.env.PUBLIC_SITE_URL || "").trim();
  if (explicit && !isLocalDevUrl(explicit)) return explicit.replace(/\/$/, "");

  const fromFrontend = (process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
  if (fromFrontend && !isLocalDevUrl(fromFrontend)) return fromFrontend;

  return PRODUCTION_SITE_ORIGIN;
}

/** Product images for Graph API must be publicly reachable (not localhost). */
function mediaOrigin(): string {
  const explicit = (process.env.FACEBOOK_MARKETPLACE_MEDIA_ORIGIN || process.env.PUBLIC_MEDIA_ORIGIN || "").trim();
  if (explicit && !isLocalDevUrl(explicit)) return explicit.replace(/\/$/, "");

  const backend = (process.env.BACKEND_URL || "").trim().replace(/\/$/, "");
  if (backend && !isLocalDevUrl(backend)) return backend;

  // Product uploads are served by API host in production.
  const apiOrigin = "https://api.qwertymates.com";
  if (!isLocalDevUrl(apiOrigin)) return apiOrigin;

  const frontend = siteOrigin();
  if (frontend && !isLocalDevUrl(frontend)) return frontend;

  return PRODUCTION_SITE_ORIGIN;
}

function enabled(): boolean {
  const flag = String(process.env.FACEBOOK_MARKETPLACE_AUTO_POST || "1").trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(flag);
}

export function getQwertymatesFacebookPageId(): string {
  return (process.env.FACEBOOK_QWERTYMATES_PAGE_ID || DEFAULT_PAGE_ID).trim();
}

export function resolveMarketplacePageKey(input: string): FacebookMarketplacePageKey | null {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw in FACEBOOK_MARKETPLACE_PAGES) return raw as FacebookMarketplacePageKey;
  for (const [key, meta] of Object.entries(FACEBOOK_MARKETPLACE_PAGES)) {
    if (meta.pageId === raw) return key as FacebookMarketplacePageKey;
    if (meta.name.toLowerCase() === raw) return key as FacebookMarketplacePageKey;
    if (meta.nameHints.some((h) => h === raw || raw.includes(h) || h.includes(raw))) {
      return key as FacebookMarketplacePageKey;
    }
  }
  return null;
}

export function getMarketplacePageId(pageKey: FacebookMarketplacePageKey): string {
  if (pageKey === "qwertymates") {
    return getQwertymatesFacebookPageId() || FACEBOOK_MARKETPLACE_PAGES.qwertymates.pageId;
  }
  const envOverride = (
    process.env[`FACEBOOK_${pageKey.toUpperCase()}_PAGE_ID`] ||
    process.env[`FACEBOOK_${FACEBOOK_MARKETPLACE_PAGES[pageKey].name.replace(/\W+/g, "_").toUpperCase()}_PAGE_ID`] ||
    ""
  ).trim();
  return envOverride || FACEBOOK_MARKETPLACE_PAGES[pageKey].pageId;
}

/** Encode path segments so Facebook can fetch URLs with spaces / special chars. */
export function encodePublicMediaUrl(url: string): string {
  try {
    const u = new URL(url);
    u.pathname = u.pathname
      .split("/")
      .map((seg) => {
        if (!seg) return seg;
        try {
          return encodeURIComponent(decodeURIComponent(seg));
        } catch {
          return encodeURIComponent(seg);
        }
      })
      .join("/");
    return u.toString();
  } catch {
    return url.replace(/ /g, "%20");
  }
}

export function toPublicAbsoluteUrl(raw: string): string | null {
  const t = String(raw || "").trim();
  if (!t) return null;
  let absolute = t;
  if (!/^https?:\/\//i.test(t)) {
    const base = mediaOrigin();
    absolute = t.startsWith("/") ? `${base}${t}` : `${base}/${t}`;
  } else if (isLocalDevUrl(t)) {
    // Rewrite localhost media to production so Graph can fetch it.
    try {
      const u = new URL(t);
      absolute = `${mediaOrigin()}${u.pathname}${u.search}`;
    } catch {
      return null;
    }
  }
  return encodePublicMediaUrl(absolute);
}

export function buildMarketplaceProductUrl(productId: string): string {
  return `${siteOrigin()}/marketplace/product/${encodeURIComponent(productId)}`;
}

function formatMoney(amount: number, currency: string): string {
  const c = (currency || "ZAR").toUpperCase();
  if (c === "ZAR") return `R${amount.toFixed(2)}`;
  return `${c} ${amount.toFixed(2)}`;
}

function hashtagsForPage(pageKey: FacebookMarketplacePageKey): string {
  if (pageKey === "buyafrika") return "#BuyAfrika #Qwertymates #QwertyHub #Marketplace";
  if (pageKey === "bmeida") return "#BMediaOnline #Qwertymates #QwertyHub #Marketplace";
  return "#Qwertymates #QwertyHub #Marketplace";
}

export function buildProductFacebookCaption(product: {
  title: string;
  price: number;
  discountPrice?: number;
  currency?: string;
  description?: string;
  productUrl: string;
  pageKey?: FacebookMarketplacePageKey;
}): string {
  const price =
    product.discountPrice != null && product.discountPrice > 0 && product.discountPrice < product.price
      ? formatMoney(product.discountPrice, product.currency || "ZAR")
      : formatMoney(product.price, product.currency || "ZAR");
  const was =
    product.discountPrice != null && product.discountPrice > 0 && product.discountPrice < product.price
      ? ` (was ${formatMoney(product.price, product.currency || "ZAR")})`
      : "";
  const desc = String(product.description || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
  const lines = [
    `🛒 ${product.title}`,
    "",
    `${price}${was}`,
    desc ? `${desc}` : "",
    "",
    `Shop on QwertyHub: ${product.productUrl}`,
    "",
    hashtagsForPage(product.pageKey || "qwertymates"),
  ].filter((l, i, arr) => !(l === "" && arr[i + 1] === ""));
  return lines.join("\n").trim();
}

export type FacebookMarketplacePostResult =
  | { ok: true; postId: string; skipped?: false; pageId: string; pageKey: FacebookMarketplacePageKey }
  | { ok: true; skipped: true; reason: string; pageId?: string; pageKey?: FacebookMarketplacePageKey }
  | { ok: false; error: string; pageId?: string; pageKey?: FacebookMarketplacePageKey };

function pagePostsMap(
  product: { facebookPagePosts?: Record<string, { postId?: string }> | null; facebookPostId?: string | null },
  pageId: string,
  pageKey: FacebookMarketplacePageKey
): string | null {
  const map = product.facebookPagePosts || {};
  const fromMap = map[pageId]?.postId || map[pageKey]?.postId;
  if (fromMap) return String(fromMap);
  // Legacy: facebookPostId means already posted to Qwertymates only.
  if (pageKey === "qwertymates" && product.facebookPostId) return String(product.facebookPostId);
  return null;
}

export function productAlreadyPostedToPage(
  product: {
    facebookPagePosts?: Record<string, { postId?: string }> | null;
    facebookPostId?: string | null;
  },
  pageKey: FacebookMarketplacePageKey,
  pageId = getMarketplacePageId(pageKey)
): boolean {
  return Boolean(pagePostsMap(product, pageId, pageKey));
}

/** Post one marketplace product to a managed Facebook Page (deduped per page). */
export async function publishProductToFacebookPage(
  productId: string,
  pageKey: FacebookMarketplacePageKey,
  opts?: { force?: boolean; skipTokenDebug?: boolean }
): Promise<FacebookMarketplacePostResult> {
  if (!enabled()) {
    return { ok: true, skipped: true, reason: "FACEBOOK_MARKETPLACE_AUTO_POST disabled", pageKey };
  }

  const pageId = getMarketplacePageId(pageKey);
  const product = await Product.findById(productId).lean();
  if (!product) return { ok: false, error: "Product not found", pageId, pageKey };
  if (!product.active) return { ok: true, skipped: true, reason: "Product not active", pageId, pageKey };
  if (!opts?.force && productAlreadyPostedToPage(product, pageKey, pageId)) {
    return { ok: true, skipped: true, reason: `Already posted to ${FACEBOOK_MARKETPLACE_PAGES[pageKey].name}`, pageId, pageKey };
  }
  if (!(await isProductPubliclyListable(product))) {
    return { ok: true, skipped: true, reason: "Product not publicly listable on QwertyHub", pageId, pageKey };
  }

  if (!opts?.skipTokenDebug) {
    try {
      const tokenDebug = await debugFacebookAccessToken();
      if (!tokenDebug.isValid) {
        return { ok: false, error: "Facebook access token invalid or expired", pageId, pageKey };
      }
      const missing = missingFacebookPublishScopes(tokenDebug.scopes);
      if (missing.length) {
        return {
          ok: false,
          error: `Facebook token missing permissions: ${missing.join(", ")}. Add in Graph API Explorer and update FACEBOOK_PAGE_ACCESS_TOKEN.`,
          pageId,
          pageKey,
        };
      }
    } catch (err) {
      const msg = formatFacebookGraphError(err);
      // App id/secret mismatch or rate limit — continue; publish will fail loudly if token is bad.
      if (!/APP_ID|APP_SECRET|Invalid OAuth access token signature|request limit|#4\b|#17\b/i.test(msg)) {
        return { ok: false, error: msg, pageId, pageKey };
      }
      console.warn(`[facebook-marketplace] token debug skipped: ${msg}`);
    }
  }

  const productUrl = buildMarketplaceProductUrl(String(product._id));
  const caption = buildProductFacebookCaption({
    title: product.title,
    price: Number(product.price || 0),
    discountPrice: product.discountPrice != null ? Number(product.discountPrice) : undefined,
    currency: product.currency,
    description: product.description,
    productUrl,
    pageKey,
  });

  const imageCandidates = (product.images || [])
    .map((img) => toPublicAbsoluteUrl(img))
    .filter((u): u is string => Boolean(u));

  try {
    let published: { postId: string } | null = null;
    let lastImageError = "";

    for (const imageUrl of imageCandidates) {
      try {
        published = await publishFacebookPagePhotoPost({
          pageId,
          imageUrl,
          caption,
          link: productUrl,
        });
        break;
      } catch (imgErr) {
        lastImageError = formatFacebookGraphError(imgErr);
        console.warn(
          `[facebook-marketplace] Photo failed for ${product._id} on ${pageKey} (${imageUrl}): ${lastImageError}`
        );
      }
    }

    if (!published) {
      if (imageCandidates.length) {
        console.warn(
          `[facebook-marketplace] Falling back to text+link post for ${product._id} on ${pageKey}` +
            (lastImageError ? ` after image error: ${lastImageError}` : "")
        );
      }
      published = await publishFacebookPageFeedPost({
        pageId,
        message: caption,
        link: productUrl,
      });
    }

    const postedAt = new Date();
    // Atomic dotted $set so parallel page workers do not clobber each other's map entries.
    const $set: Record<string, unknown> = {
      [`facebookPagePosts.${pageId}`]: { postId: published.postId, postedAt },
    };
    if (pageKey === "qwertymates") {
      $set.facebookPostId = published.postId;
      $set.facebookPostedAt = postedAt;
    }

    await Product.updateOne({ _id: product._id }, { $set });

    console.log(
      `[facebook-marketplace] Posted product ${product._id} → ${FACEBOOK_MARKETPLACE_PAGES[pageKey].name} (${pageId}) post ${published.postId}`
    );
    return { ok: true, postId: published.postId, pageId, pageKey };
  } catch (err) {
    const msg = formatFacebookGraphError(err);
    console.error(`[facebook-marketplace] Failed product ${product._id} on ${pageKey}:`, msg);
    return { ok: false, error: msg, pageId, pageKey };
  }
}

/** Post one marketplace product to the Qwertymates Facebook Page (deduped via product.facebookPostId). */
export async function publishProductToQwertymatesFacebook(
  productId: string,
  opts?: { force?: boolean; skipTokenDebug?: boolean }
): Promise<FacebookMarketplacePostResult> {
  return publishProductToFacebookPage(productId, "qwertymates", opts);
}

/** Fire-and-forget helper for product create / activate hooks (Qwertymates Page only). */
export function queueFacebookPostForProduct(productId: string, reason?: string): void {
  if (!enabled()) return;
  void publishProductToQwertymatesFacebook(productId).then((r) => {
    if (!r.ok) {
      console.error(`[facebook-marketplace] queue failed (${reason || "hook"}):`, r.error);
    } else if (r.skipped) {
      console.log(`[facebook-marketplace] skipped ${productId}: ${r.reason}`);
    }
  });
}

/** Optionally queue the same product to all configured marketplace Pages (create/activate). */
export function queueFacebookPostForProductAllPages(productId: string, reason?: string): void {
  if (!enabled()) return;
  const keys = Object.keys(FACEBOOK_MARKETPLACE_PAGES) as FacebookMarketplacePageKey[];
  for (const pageKey of keys) {
    void publishProductToFacebookPage(productId, pageKey).then((r) => {
      if (!r.ok) {
        console.error(`[facebook-marketplace] queue failed (${reason || "hook"} / ${pageKey}):`, r.error);
      } else if (r.skipped) {
        console.log(`[facebook-marketplace] skipped ${productId} (${pageKey}): ${r.reason}`);
      }
    });
  }
}
