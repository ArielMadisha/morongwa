/**
 * CJ Dropshipping API adapter
 * Docs: https://developers.cjdropshipping.com/
 */

import type { SupplierAdapter, SupplierProduct, SupplierOrderRequest, SupplierOrderResponse, TrackingInfo, FreightQuoteRequest, FreightQuoteResult } from "./types";

const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

interface CJTokenData {
  accessToken: string;
  accessTokenExpiryDate: string;
  refreshToken: string;
  refreshTokenExpiryDate: string;
}

interface CJApiResponse<T> {
  code: number;
  result: boolean;
  message?: string;
  data: T;
  success?: boolean;
}

export function createCJAdapter(apiKey: string, externalSupplierId: string): SupplierAdapter {
  let tokenCache: CJTokenData | null = null;

  async function getAccessToken(): Promise<string> {
    if (tokenCache?.accessToken) {
      const expiry = new Date(tokenCache.accessTokenExpiryDate).getTime();
      if (Date.now() < expiry - 3600000) return tokenCache.accessToken;
      try {
        const res = await fetch(`${CJ_BASE}/authentication/refreshAccessToken`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: tokenCache.refreshToken }),
        });
        const json = await res.json() as CJApiResponse<CJTokenData>;
        if (json.code === 200 && json.data) {
          tokenCache = json.data;
          return tokenCache.accessToken;
        }
      } catch {
        /* fall through to refresh */
      }
    }

    const res = await fetch(`${CJ_BASE}/authentication/getAccessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    const json = await res.json() as CJApiResponse<CJTokenData>;
    if (json.code !== 200 || !json.data) {
      throw new Error(`CJ auth failed: ${json.message || "Unknown error"}`);
    }
    tokenCache = json.data;
    return tokenCache.accessToken;
  }

  async function cjGet<T>(path: string, params?: Record<string, string>): Promise<T> {
    const token = await getAccessToken();
    const url = new URL(`${CJ_BASE}${path}`);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), {
      headers: { "CJ-Access-Token": token },
    });
    const json = await res.json() as CJApiResponse<T>;
    if (json.code !== 200) throw new Error(`CJ API error: ${json.message || "Unknown"}`);
    return json.data;
  }

  async function cjPost<T>(path: string, body: unknown): Promise<T> {
    const token = await getAccessToken();
    const res = await fetch(`${CJ_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CJ-Access-Token": token,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json() as CJApiResponse<T>;
    if (json.code !== 200) throw new Error(`CJ API error: ${json.message || "Unknown"}`);
    return json.data;
  }

  const mapProduct = (p: any): SupplierProduct => {
    const cost = parseFloat(p.nowPrice || p.discountPrice || p.sellPrice || "0");
    const firstVariant = p.variants?.[0];
    let images: string[] = [];
    if (Array.isArray(p.productImageSet)) images = p.productImageSet;
    else if (p.bigImage) images = [p.bigImage];
    else if (p.productImage) {
      try {
        images = typeof p.productImage === "string" && p.productImage.startsWith("[")
          ? JSON.parse(p.productImage)
          : [p.productImage];
      } catch {
        images = [String(p.productImage)];
      }
    }
    return {
      id: p.pid || p.id,
      name: p.productNameEn || p.nameEn || p.productName || "",
      sku: p.productSku || p.sku || p.spu,
      description: p.description,
      images,
      supplierCost: cost,
      currency: "USD",
      defaultVariantId: firstVariant?.vid,
      defaultVariantSku: firstVariant?.variantSku,
      variants: p.variants?.map((v: any) => ({
        id: v.vid,
        sku: v.variantSku,
        name: v.variantNameEn,
        price: parseFloat(v.variantSellPrice || v.variantSugSellPrice || "0"),
      })),
      categories: p.threeCategoryName ? [p.threeCategoryName] : [],
      raw: p,
    };
  };

  return {
    id: externalSupplierId,
    source: "cj",
    async getProduct(id: string): Promise<SupplierProduct | null> {
      try {
        const data = await cjGet<Record<string, unknown>>("/product/query", { pid: id });
        if (!data?.pid) return null;
        return mapProduct(data);
      } catch {
        return null;
      }
    },

    async searchProducts(query: string, filters?: { page?: number; size?: number }): Promise<SupplierProduct[]> {
      const page = filters?.page ?? 1;
      const size = Math.min(filters?.size ?? 20, 100);
      const data = await cjGet<any>("/product/listV2", {
        keyWord: query || "",
        page: String(page),
        size: String(size),
        features: "enable_description,enable_category",
      });
      const items = (data?.content || []).flatMap((c: any) => c.productList || []);
      return items.map(mapProduct);
    },

    async createOrder(order: SupplierOrderRequest): Promise<SupplierOrderResponse> {
      const products = order.products.map((p, i) => ({
        vid: p.variantId || undefined,
        sku: p.variantSku || undefined,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        storeLineItemId: p.storeLineItemId || `line-${i}`,
      }));

      const body = {
        orderNumber: order.orderNumber,
        shippingCountryCode: order.shipping.countryCode,
        shippingCountry: order.shipping.country,
        shippingProvince: order.shipping.province || order.shipping.city,
        shippingCity: order.shipping.city,
        shippingAddress: order.shipping.address,
        shippingAddress2: order.shipping.address2 || "",
        shippingZip: order.shipping.zip || "",
        shippingPhone: order.shipping.phone || "",
        shippingCustomerName: order.shipping.name,
        email: order.shipping.email || "",
        remark: order.remark || "",
        logisticName: order.logisticName,
        fromCountryCode: order.fromCountryCode,
        payType: 3, // create order only, no payment
        shopLogisticsType: 2, // seller logistics
        products,
      };

      const data = await cjPost<any>("/shopping/order/createOrderV2", body);
      return {
        orderId: data?.orderId,
        orderNumber: order.orderNumber,
        success: true,
        cjPayUrl: data?.cjPayUrl,
      };
    },

    async getTracking(trackNumber: string): Promise<TrackingInfo | null> {
      try {
        const data = await cjGet<any[]>("/logistic/trackInfo", { trackNumber });
        const first = Array.isArray(data) ? data[0] : data;
        if (!first) return null;
        return {
          trackingNumber: first.trackingNumber || trackNumber,
          carrier: first.logisticName || first.lastMileCarrier,
          status: first.trackingStatus,
          deliveredAt: first.deliveryTime,
        };
      } catch {
        return null;
      }
    },

    async getFreightQuote(req: FreightQuoteRequest): Promise<FreightQuoteResult | null> {
      try {
        const body = {
          startCountryCode: req.startCountryCode,
          endCountryCode: req.endCountryCode,
          products: req.products.map((p) => ({ vid: p.vid, quantity: p.quantity })),
          ...(req.zip ? { zip: req.zip } : {}),
        };
        const data = await cjPost<any[]>("/logistic/freightCalculate", body);
        const first = Array.isArray(data) ? data[0] : data;
        if (!first || typeof first.logisticPrice !== "number") return null;
        return {
          logisticPrice: first.logisticPrice,
          logisticName: first.logisticName,
          logisticAging: first.logisticAging,
        };
      } catch {
        return null;
      }
    },

    async getStockByVid(vid: string): Promise<number | null> {
      try {
        const data = await cjGet<any[]>("/product/stock/queryByVid", { vid });
        const warehouses = Array.isArray(data) ? data : [];
        const total = warehouses.reduce((sum: number, w: any) => sum + (Number(w.totalInventoryNum) || 0), 0);
        return total;
      } catch {
        return null;
      }
    },
  };
}
