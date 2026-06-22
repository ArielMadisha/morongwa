/**
 * SHEIN Open Platform dropshipping adapter.
 * Product + order APIs: https://open.sheincorp.com/
 *
 * Env (after Open Platform app review — NOT portal login password):
 *   SHEIN_OPEN_KEY_ID, SHEIN_OPEN_SECRET_KEY
 * Optional path overrides when SHEIN updates API versions:
 *   SHEIN_API_PRODUCT_DETAIL_PATH, SHEIN_API_PRODUCT_SEARCH_PATH, SHEIN_API_CREATE_ORDER_PATH
 */

import type {
  SupplierAdapter,
  SupplierProduct,
  SupplierOrderRequest,
  SupplierOrderResponse,
  TrackingInfo,
} from "./types";
import { sheinOpenApiRequest, type SheinOpenApiConfig } from "./sheinOpenApiClient";

const PRODUCT_DETAIL_PATH = process.env.SHEIN_API_PRODUCT_DETAIL_PATH || "/open-api/goods/spu/info";
const PRODUCT_SEARCH_PATH = process.env.SHEIN_API_PRODUCT_SEARCH_PATH || "/open-api/goods/spu/list";
const CREATE_ORDER_PATH = process.env.SHEIN_API_CREATE_ORDER_PATH || "/open-api/order/create";

function pickImages(raw: Record<string, unknown>): string[] {
  const imgs: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) imgs.push(v.trim());
  };
  push(raw.mainImage);
  push(raw.image);
  push(raw.imageUrl);
  const list = raw.imageList || raw.images || raw.image_list;
  if (Array.isArray(list)) {
    for (const x of list) {
      if (typeof x === "string") push(x);
      else if (x && typeof x === "object") push((x as any).url || (x as any).imageUrl);
    }
  }
  return [...new Set(imgs)].slice(0, 12);
}

function normalizeSheinProduct(raw: Record<string, unknown>, fallbackId: string): SupplierProduct | null {
  const id = String(raw.spuCode || raw.spu_code || raw.productId || raw.id || fallbackId || "").trim();
  if (!id) return null;

  const name = String(raw.productName || raw.title || raw.name || `SHEIN ${id}`).trim();
  const skus = (raw.skuList || raw.skus || raw.sku_list || []) as unknown[];
  const variants = Array.isArray(skus)
    ? skus.map((v: any) => ({
        id: String(v.skuCode || v.sku_code || v.id || v.sku || ""),
        sku: v.skuCode || v.sku_code || v.sku,
        name: v.skuName || v.title || v.name,
        price: Number(v.price || v.salePrice || v.supplierPrice || 0),
      }))
    : [];

  let supplierCost = Number(raw.price || raw.salePrice || raw.supplierPrice || 0);
  if (!supplierCost && variants.length) {
    supplierCost = Math.min(...variants.map((v) => v.price).filter((p) => p > 0));
  }
  if (!supplierCost || !Number.isFinite(supplierCost)) supplierCost = 0;

  const defaultVariant = variants.find((v) => v.id) || variants[0];

  return {
    id,
    name,
    sku: String(raw.skuCode || raw.sku_code || defaultVariant?.sku || id),
    description: String(raw.description || raw.desc || "").trim() || undefined,
    images: pickImages(raw),
    supplierCost,
    currency: "USD",
    defaultVariantId: defaultVariant?.id,
    defaultVariantSku: defaultVariant?.sku,
    variants: variants.filter((v) => v.id),
    categories: raw.categoryName ? [String(raw.categoryName)] : ["Fashion"],
    raw,
  };
}

export function createSheinAdapter(
  openKeyId: string,
  secretKey: string,
  externalSupplierId: string
): SupplierAdapter {
  const cfg: SheinOpenApiConfig = { openKeyId, secretKey };

  return {
    id: externalSupplierId,
    source: "shein",
    async getProduct(id: string): Promise<SupplierProduct | null> {
      const spuCode = String(id || "").trim();
      if (!spuCode) return null;
      try {
        const res = await sheinOpenApiRequest<{ data?: Record<string, unknown> }>(cfg, "POST", PRODUCT_DETAIL_PATH, {
          body: { spuCode },
        });
        const data = (res as any)?.data?.info || (res as any)?.data || res;
        if (!data || typeof data !== "object") return null;
        return normalizeSheinProduct(data as Record<string, unknown>, spuCode);
      } catch {
        return null;
      }
    },
    async searchProducts(query: string, filters?: { page?: number; size?: number }): Promise<SupplierProduct[]> {
      const page = Math.max(1, filters?.page ?? 1);
      const pageSize = Math.min(Math.max(1, filters?.size ?? 20), 100);
      const q = String(query || "").trim();
      try {
        const res = await sheinOpenApiRequest<{ data?: { list?: unknown[]; records?: unknown[] } }>(
          cfg,
          "POST",
          PRODUCT_SEARCH_PATH,
          {
            body: {
              page,
              pageSize,
              pageNum: page,
              keyword: q || undefined,
              productName: q || undefined,
            },
          }
        );
        const list = (res as any)?.data?.list || (res as any)?.data?.records || (res as any)?.data || [];
        if (!Array.isArray(list)) return [];
        const out: SupplierProduct[] = [];
        for (const row of list) {
          if (!row || typeof row !== "object") continue;
          const p = normalizeSheinProduct(row as Record<string, unknown>, "");
          if (p) out.push(p);
        }
        if (q) {
          const ql = q.toLowerCase();
          return out.filter((p) => p.name.toLowerCase().includes(ql) || p.id.toLowerCase().includes(ql));
        }
        return out;
      } catch {
        return [];
      }
    },
    async createOrder(order: SupplierOrderRequest): Promise<SupplierOrderResponse> {
      const s = order.shipping;
      const products = order.products.map((p) => ({
        skuCode: p.variantSku || p.variantId,
        quantity: p.quantity,
        salePrice: p.unitPrice,
      }));
      try {
        const res = await sheinOpenApiRequest<{ data?: { orderNo?: string; orderId?: string } }>(
          cfg,
          "POST",
          CREATE_ORDER_PATH,
          {
            body: {
              orderNo: order.orderNumber,
              receiverName: s.name,
              receiverPhone: s.phone,
              receiverAddress: [s.address, s.address2].filter(Boolean).join(", "),
              receiverCity: s.city,
              receiverProvince: s.province,
              receiverCountry: s.countryCode,
              receiverZip: s.zip,
              receiverEmail: s.email,
              remark: order.remark,
              skuList: products,
            },
          }
        );
        const data = (res as any)?.data || {};
        const extId = String(data.orderNo || data.orderId || "").trim();
        return {
          orderNumber: order.orderNumber,
          orderId: extId || undefined,
          success: !!extId,
          message: extId ? "SHEIN order submitted" : "SHEIN order response missing order id",
        };
      } catch (e: any) {
        return {
          orderNumber: order.orderNumber,
          success: false,
          message: String(e?.message || e),
        };
      }
    },
    async getTracking(trackNumber: string): Promise<TrackingInfo | null> {
      if (!trackNumber?.trim()) return null;
      return {
        trackingNumber: trackNumber.trim(),
        carrier: "SHEIN",
      };
    },
    async getStockByVid(vid: string): Promise<number | null> {
      const p = await this.getProduct(vid);
      if (!p) return null;
      const variants = p.variants || [];
      if (!variants.length) return 999;
      return 999;
    },
  };
}
