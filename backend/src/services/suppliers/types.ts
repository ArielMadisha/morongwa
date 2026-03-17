/**
 * Unified supplier adapter types – CJ, Spocket, EPROLO
 */

export interface SupplierProduct {
  id: string;
  name: string;
  sku?: string;
  description?: string;
  images: string[];
  /** Raw cost from supplier (USD) */
  supplierCost: number;
  currency: string;
  /** Variant ID for ordering (CJ: vid) */
  defaultVariantId?: string;
  /** Variant SKU for ordering */
  defaultVariantSku?: string;
  /** All variants when available */
  variants?: Array<{
    id: string;
    sku?: string;
    name?: string;
    price: number;
  }>;
  categories?: string[];
  raw?: Record<string, unknown>;
}

export interface SupplierOrderProduct {
  variantId?: string;
  variantSku?: string;
  quantity: number;
  unitPrice?: number;
  storeLineItemId?: string;
}

export interface SupplierOrderRequest {
  orderNumber: string;
  shipping: {
    name: string;
    address: string;
    address2?: string;
    city: string;
    province: string;
    country: string;
    countryCode: string;
    zip?: string;
    phone?: string;
    email?: string;
  };
  products: SupplierOrderProduct[];
  /** Courier/logistic name from CourierRule */
  logisticName: string;
  /** Warehouse country code (e.g. CN, US) */
  fromCountryCode: string;
  remark?: string;
}

export interface SupplierOrderResponse {
  orderId?: string;
  orderNumber: string;
  success: boolean;
  message?: string;
  cjPayUrl?: string;
}

export interface TrackingInfo {
  trackingNumber: string;
  carrier?: string;
  status?: string;
  trackingUrl?: string;
  deliveredAt?: string;
}

export type ExternalSupplierSource = "cj" | "spocket" | "eprolo";

export interface FreightQuoteRequest {
  startCountryCode: string;
  endCountryCode: string;
  products: Array<{ vid: string; quantity: number }>;
  zip?: string;
}

export interface FreightQuoteResult {
  logisticPrice: number; // USD
  logisticName?: string;
  logisticAging?: string;
}

export interface SupplierAdapter {
  id: string;
  source: ExternalSupplierSource;
  getProduct(id: string): Promise<SupplierProduct | null>;
  searchProducts(query: string, filters?: { page?: number; size?: number }): Promise<SupplierProduct[]>;
  createOrder(order: SupplierOrderRequest): Promise<SupplierOrderResponse>;
  getTracking(trackNumber: string): Promise<TrackingInfo | null>;
  /** Get freight quote in USD (CJ only; others return null) */
  getFreightQuote?(req: FreightQuoteRequest): Promise<FreightQuoteResult | null>;
  /** Get stock quantity by variant ID (CJ only; others return null) */
  getStockByVid?(vid: string): Promise<number | null>;
}
