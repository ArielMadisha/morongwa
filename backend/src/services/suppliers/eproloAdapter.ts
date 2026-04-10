/**
 * EPROLO Dropshipping API adapter
 * Docs: https://openapi.eprolo.com/
 * Auth: sign = MD5(apiKey + timestamp + apiSecret), headers: apiKey, sign, timestamp
 */

import crypto from "crypto";
import type {
  SupplierAdapter,
  SupplierProduct,
  SupplierOrderRequest,
  SupplierOrderResponse,
  TrackingInfo,
} from "./types";

const EPROLO_BASE = "https://openapi.eprolo.com";
const EPROLO_HTTP_TIMEOUT_MS = 15000;

const countryCodeToName: Record<string, string> = {
  ZA: "South Africa",
  BW: "Botswana",
  NA: "Namibia",
  LS: "Lesotho",
  SZ: "Eswatini",
  ZW: "Zimbabwe",
  ZM: "Zambia",
  MZ: "Mozambique",
  US: "United States",
  GB: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  DE: "Germany",
  FR: "France",
  NL: "Netherlands",
  IE: "Ireland",
};

interface EproloApiResponse<T> {
  code: string | number;
  msg?: string;
  data: T;
}

/** Lowercased text blob used for admin keyword search (titles rarely include full category names like "Shoes & Bags"). */
function eproloProductSearchHaystack(p: EproloProduct): string {
  const body = (p.body_html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .toLowerCase();
  return [
    (p.title || "").toLowerCase(),
    (p.handle || "").toLowerCase(),
    body,
    (p.wareTypeId || "").toLowerCase(),
    (p.wareTypeTwoId || "").toLowerCase(),
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function eproloTokenMatchesHaystack(token: string, hay: string): boolean {
  const t = token
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/gu, "")
    .replace(/[^\p{L}\p{N}]+$/gu, "");
  if (t.length < 2) return false;
  if (hay.includes(t)) return true;
  if (t.length > 3 && t.endsWith("ies") && hay.includes(t.slice(0, -3) + "y")) return true;
  if (t.length > 3 && t.endsWith("es") && !t.endsWith("sses") && hay.includes(t.slice(0, -2))) return true;
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) {
    if (hay.includes(t.slice(0, -1))) return true;
  }
  if (t.length >= 3 && !t.endsWith("s") && hay.includes(`${t}s`)) return true;
  return false;
}

/**
 * Match user query against catalog fields.
 * - Phrases with "&" or "," behave like EPROLO categories: "shoes & bags" → shoes OR bags (each side can be multi-word AND).
 * - Plain phrases: all words must match (AND).
 */
function eproloProductMatchesSearchQuery(p: EproloProduct, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase().replace(/&amp;/g, "&");
  if (!query) return true;
  const hay = eproloProductSearchHaystack(p);
  if (!hay) return false;

  const orSegments = query
    .split(/\s*(?:&|,)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  const segmentMatches = (segment: string): boolean => {
    const tokens = segment.split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 0);
    const significant = tokens.filter((w) => w.length >= 2 || /\d/.test(w));
    if (significant.length === 0) return false;
    return significant.every((tok) => eproloTokenMatchesHaystack(tok, hay));
  };

  if (orSegments.length > 1) {
    return orSegments.some(segmentMatches);
  }

  return segmentMatches(orSegments[0] || query);
}

interface EproloProduct {
  id: string;
  title?: string;
  handle?: string;
  imagefirst?: string;
  body_html?: string;
  status?: number;
  createtime?: string;
  updatetime?: string;
  variantlist?: Array<{
    id: string;
    title?: string;
    sku?: string;
    cost?: number;
    inventory_quantity?: number;
    option1?: string;
    option2?: string;
    option3?: string;
    position?: number;
  }>;
  imagelist?: Array<{
    id: string;
    src: string;
    position?: number;
  }>;
  wareTypeId?: string;
  wareTypeTwoId?: string;
}

function buildSign(apiKey: string, timestamp: string, apiSecret: string): string {
  const str = apiKey + timestamp + apiSecret;
  return crypto.createHash("md5").update(str).digest("hex").toLowerCase();
}

function eproloHeaders(apiKey: string, apiSecret: string): Record<string, string> {
  const timestamp = String(Date.now());
  const sign = buildSign(apiKey, timestamp, apiSecret);
  return {
    "Content-Type": "application/json",
    apiKey,
    sign,
    timestamp,
  };
}

export function createEproloAdapter(
  apiKey: string,
  apiSecret: string,
  externalSupplierId: string
): SupplierAdapter {
  async function eproloFetchJson<T>(url: string, init?: RequestInit): Promise<EproloApiResponse<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EPROLO_HTTP_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...(init || {}), signal: controller.signal });
      const json = (await res.json()) as EproloApiResponse<T>;
      return json;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function eproloGet<T>(path: string, params?: Record<string, string>): Promise<T> {
    const { sign, timestamp } = eproloHeaders(apiKey, apiSecret);
    const url = new URL(`${EPROLO_BASE}${path}`);
    url.searchParams.set("sign", sign);
    url.searchParams.set("timestamp", timestamp);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const json = await eproloFetchJson<T>(url.toString(), {
      headers: { "Content-Type": "application/json", apiKey },
    });
    if (String(json.code) !== "0") {
      throw new Error(`EPROLO API error: ${json.msg || "Unknown"}`);
    }
    return json.data;
  }

  async function eproloPost<T>(path: string, body: unknown): Promise<T> {
    const { sign, timestamp } = eproloHeaders(apiKey, apiSecret);
    const url = `${EPROLO_BASE}${path}?sign=${encodeURIComponent(sign)}&timestamp=${timestamp}`;
    const json = await eproloFetchJson<T>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apiKey },
      body: JSON.stringify(body),
    });
    if (String(json.code) !== "0") {
      throw new Error(`EPROLO API error: ${json.msg || "Unknown"}`);
    }
    return json.data;
  }

  async function findProductInCatalogById(productId: string): Promise<EproloProduct | null> {
    const target = String(productId || "").trim();
    if (!target) return null;
    const maxPages = 20;
    const pageSize = 100;
    for (let pageIdx = 0; pageIdx < maxPages; pageIdx++) {
      let data: EproloProduct[];
      try {
        data = await eproloGet<EproloProduct[]>("/eprolo_product_list.html", {
          page_index: String(pageIdx),
          page_size: String(pageSize),
        });
      } catch {
        if (pageIdx === 0) {
          data = await eproloGet<EproloProduct[]>("/eprolo_product_list.html");
        } else {
          break;
        }
      }
      const arr = Array.isArray(data) ? data : [];
      if (!arr.length) break;
      const found = arr.find((p) => String((p as any)?.id ?? "").trim() === target);
      if (found) return found;
      if (arr.length < pageSize) break;
    }
    return null;
  }

  function mapProduct(p: EproloProduct): SupplierProduct {
    const variants = (p.variantlist || []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const firstVariant = variants[0];
    const cost = firstVariant?.cost ?? 0;
    let images: string[] = [];
    if (p.imagelist?.length) {
      images = p.imagelist
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((i) => i.src);
    }
    if (images.length === 0 && p.imagefirst) images = [p.imagefirst];
    // Normalize variants for orderForwardingService (expects vid, variantSku)
    const raw = {
      ...p,
      variants: variants.map((v) => ({ vid: v.id, variantSku: v.sku })),
    };
    return {
      id: p.id,
      name: p.title || p.handle || "",
      sku: firstVariant?.sku,
      description: p.body_html,
      images,
      supplierCost: typeof cost === "number" ? cost : parseFloat(String(cost)) || 0,
      currency: "USD",
      defaultVariantId: firstVariant?.id,
      defaultVariantSku: firstVariant?.sku,
      variants: variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        name: v.title || [v.option1, v.option2, v.option3].filter(Boolean).join(" / "),
        price: typeof v.cost === "number" ? v.cost : parseFloat(String(v.cost)) || 0,
      })),
      categories: [],
      raw: raw as unknown as Record<string, unknown>,
    };
  }

  return {
    id: externalSupplierId,
    source: "eprolo",
    async getProduct(id: string): Promise<SupplierProduct | null> {
      const normalizedId = String(id || "").trim();
      if (!normalizedId) return null;
      try {
        // add_product adds to store and returns product data
        const data = await eproloPost<EproloProduct[] | EproloProduct>("/add_product.html", { ids: [normalizedId] });
        const arr = Array.isArray(data) ? data : data ? [data] : [];
        const first = arr[0];
        if (first?.id) return mapProduct(first);
      } catch (err: any) {
        // Fall back to catalog lookup by ID (handles cases where add_product fails but product exists/listable).
        const fallback = await findProductInCatalogById(normalizedId);
        if (fallback?.id) return mapProduct(fallback);
        const msg = err?.message || "EPROLO add_product failed";
        throw new Error(msg);
      }
      // If add_product returned no rows, still try catalog lookup before giving up.
      const fallback = await findProductInCatalogById(normalizedId);
      if (fallback?.id) return mapProduct(fallback);
      return null;
    },

    async searchProducts(query: string, filters?: { page?: number; size?: number }): Promise<SupplierProduct[]> {
      try {
        const pageSize = 100;
        const page = Math.max(1, filters?.page ?? 1);
        const size = Math.min(filters?.size ?? 20, 200);

        const fetchApiPage = async (pageIdx: number): Promise<EproloProduct[]> => {
          let data: EproloProduct[];
          try {
            data = await eproloGet<EproloProduct[]>("/eprolo_product_list.html", {
              page_index: String(pageIdx),
              page_size: String(pageSize),
            });
          } catch {
            if (pageIdx === 0) {
              data = await eproloGet<EproloProduct[]>("/eprolo_product_list.html");
            } else {
              return [];
            }
          }
          return Array.isArray(data) ? data : [];
        };

        if (query && query.trim()) {
          const q = query.trim();
          const maxApiPages = 6;
          const requiredForPage = page * size;
          const filtered: EproloProduct[] = [];
          for (let pageIdx = 0; pageIdx < maxApiPages; pageIdx++) {
            const arr = await fetchApiPage(pageIdx);
            if (arr.length === 0) break;
            for (const p of arr) {
              if (eproloProductMatchesSearchQuery(p, q)) filtered.push(p);
            }
            // Stop once we have enough rows to satisfy requested page.
            if (filtered.length >= requiredForPage) break;
            if (arr.length < pageSize) break;
          }
          const sliceStart = (page - 1) * size;
          return filtered.slice(sliceStart, sliceStart + size).map(mapProduct);
        }

        // Browse (empty query): pull enough API pages to satisfy requested window
        const maxApiPagesCap = 30;
        const apiPagesNeeded = Math.min(Math.ceil((page * size) / pageSize), maxApiPagesCap);
        let allProducts: EproloProduct[] = [];
        for (let pageIdx = 0; pageIdx < apiPagesNeeded; pageIdx++) {
          const arr = await fetchApiPage(pageIdx);
          if (arr.length === 0) break;
          allProducts = allProducts.concat(arr);
          if (arr.length < pageSize) break;
        }
        const sliceStart = (page - 1) * size;
        return allProducts.slice(sliceStart, sliceStart + size).map(mapProduct);
      } catch {
        return [];
      }
    },

    async createOrder(order: SupplierOrderRequest): Promise<SupplierOrderResponse> {
      const orderItemlist = order.products.map((p) => ({
        variantsid: p.variantId || p.variantSku,
        quantity: p.quantity,
      }));

      if (orderItemlist.some((p) => !p.variantsid)) {
        throw new Error("EPROLO requires variantsid for each product");
      }

      const [line1, ...rest] = (order.shipping.address || "").split(",").map((s) => s.trim());
      const countryCode = (order.shipping.countryCode || order.shipping.country || "ZA").toUpperCase().slice(0, 2);
      const countryName = countryCodeToName[countryCode] || order.shipping.country || countryCode;
      const body = {
        order_id: order.orderNumber,
        order_number: order.orderNumber,
        shipping_country: countryName,
        shipping_country_code: countryCode,
        shipping_province: order.shipping.province || order.shipping.city || "N/A",
        shipping_province_code: (order.shipping.province || order.shipping.city || "N/A").slice(0, 10),
        shipping_post_code: order.shipping.zip || "0000",
        shipping_city: order.shipping.city || "N/A",
        shipping_name: order.shipping.name,
        shipping_address: line1 || order.shipping.address || "N/A",
        shipping_address2: rest.join(", ") || "",
        shipping_phone: order.shipping.phone || "",
        email: order.shipping.email || "",
        note: order.remark || "",
        tax_cost: 0,
        orderItemlist,
      };

      const data = (await eproloPost<{ orderid?: string }>("/add_order.html", body)) as any;
      return {
        orderId: data?.orderid,
        orderNumber: order.orderNumber,
        success: true,
      };
    },

    async getTracking(_unused: string): Promise<TrackingInfo | null> {
      // EPROLO order_list returns logistics with tracking; no dedicated track endpoint in docs
      return null;
    },

    async getStockByVid(variantsid: string): Promise<number | null> {
      try {
        const data = await eproloGet<any>(
          "/product_inventory.html",
          { variantsid }
        );

        // EPROLO can return different shapes depending on account/API version.
        const rows: any[] = Array.isArray(data)
          ? data
          : Array.isArray((data as any)?.list)
            ? (data as any).list
            : Array.isArray((data as any)?.data)
              ? (data as any).data
              : data && typeof data === "object"
                ? [data]
                : [];

        if (!rows.length) return null;

        let matched = 0;
        let total = 0;
        for (const r of rows) {
          const candidates = [
            r?.num,
            r?.num_private,
            r?.inventory_quantity,
            r?.stock,
            r?.quantity,
            r?.qty,
          ];
          for (const c of candidates) {
            const n = Number(c);
            if (Number.isFinite(n)) {
              total += n;
              matched++;
            }
          }
        }

        if (matched === 0) return null;
        return Math.max(0, Math.floor(total));
      } catch {
        return null;
      }
    },
  };
}
