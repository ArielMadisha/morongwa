/**
 * Per-order and aggregate dropshipping / checkout profit breakdown.
 * Customer pays Qwertymates; supplier COGS uses stored supplierCost (USD for CJ/EPROLO).
 * Music uses same 30% platform / 70% artist split as checkout webhook.
 */

import Order from "../data/models/Order";
import type { IOrderItem } from "../data/models/Order";
import type { IProduct } from "../data/models/Product";
import { getFxRates, convertUsdTo } from "./fxService";
import { getPayGateFlatFeeZar } from "./payment";

const MUSIC_PLATFORM_PCT = 30;
const MUSIC_OWNER_PCT = 70;

export type DropshippingLineProfit = {
  productId: string;
  title: string;
  supplierSource: string;
  qty: number;
  lineRevenueZar: number;
  supplierCogsZar: number;
  supplierCogsMissing: boolean;
};

export type OrderProfitBreakdown = {
  orderId: string;
  status: string;
  paidAt: string | null;
  paymentMethod: string;
  /** Total charged to customer (subtotal + music + shipping). */
  customerPaidZar: number;
  productSubtotalZar: number;
  musicSubtotalZar: number;
  shippingChargedZar: number;
  resellerCommissionZar: number;
  /** PayGate flat card fee (R5 default); 0 for wallet checkout. */
  paygateFeeZar: number;
  /** Sum of estimated supplier COGS for product lines (ZAR). */
  supplierCogsZar: number;
  /** 70% of music subtotal — amount that flows to artists per platform rules. */
  musicArtistShareZar: number;
  /** 30% of music subtotal — platform share from music. */
  musicPlatformShareZar: number;
  /**
   * Estimated amount retained by platform after COGS, reseller cut, music artist share, and card fee.
   * Formula: customerPaid - resellerCommission - supplierCogs - musicArtistShare - paygateFee
   */
  netPlatformCommissionZar: number;
  lines: DropshippingLineProfit[];
  notes: string[];
};

function lineCogsZar(
  product: IProduct | null,
  qty: number,
  rates: Record<string, number>
): { cogsZar: number; missing: boolean } {
  if (!product) return { cogsZar: 0, missing: true };
  const cost = product.supplierCost;
  if (cost == null || !Number.isFinite(Number(cost))) {
    return { cogsZar: 0, missing: true };
  }
  const cur = String((product as any).currency || "ZAR").toUpperCase();
  const n = Number(cost);
  if (cur === "USD") {
    return {
      cogsZar: Math.round(convertUsdTo(n * qty, "ZAR", rates) * 100) / 100,
      missing: false,
    };
  }
  if (cur === "ZAR") {
    return { cogsZar: Math.round(n * qty * 100) / 100, missing: false };
  }
  // Other currencies: approximate via USD if rate exists, else treat as ZAR
  const rate = rates[cur];
  if (rate && rate > 0) {
    const usd = n / rate;
    return {
      cogsZar: Math.round(convertUsdTo(usd * qty, "ZAR", rates) * 100) / 100,
      missing: false,
    };
  }
  return { cogsZar: Math.round(n * qty * 100) / 100, missing: false };
}

function musicSubtotalZar(order: Record<string, unknown>): number {
  const items = (order as any).musicItems as Array<{ qty: number; price: number }> | undefined;
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items.reduce((s, m) => s + Number(m.price || 0) * Number(m.qty || 0), 0);
}

/**
 * Core calculation — pass pre-fetched `rates` when aggregating many orders.
 */
export function computeOrderProfitFromLoadedOrder(
  order: Record<string, unknown>,
  rates: Record<string, number>
): OrderProfitBreakdown {
  const amounts = (order as any).amounts || {};
  const total = Math.round(Number(amounts.total || 0) * 100) / 100;
  const subtotal = Math.round(Number(amounts.subtotal || 0) * 100) / 100;
  const shipping = Math.round(Number(amounts.shipping || 0) * 100) / 100;
  const commissionTotal = Math.round(Number(amounts.commissionTotal || 0) * 100) / 100;
  const musicRev = Math.round(musicSubtotalZar(order) * 100) / 100;
  const paygateFee =
    String((order as any).paymentMethod || "") === "card" ? getPayGateFlatFeeZar() : 0;

  const lines: DropshippingLineProfit[] = [];
  const notes: string[] = [];
  let supplierCogsSum = 0;

  const rawItems = ((order as any).items || []) as IOrderItem[];
  for (const it of rawItems) {
    const pop = (it as any).productId as IProduct | null;
    const product = pop && typeof pop === "object" && "_id" in pop ? (pop as IProduct) : null;
    const title = product?.title || "Product";
    const src = String(product?.supplierSource || "internal");
    const qty = Number(it.qty || 0);
    const lineRev = Math.round(Number(it.price || 0) * qty * 100) / 100;
    const { cogsZar, missing } = lineCogsZar(product, qty, rates);
    supplierCogsSum += cogsZar;
    if (missing && (src === "cj" || src === "eprolo" || src === "spocket")) {
      notes.push(`Missing supplierCost for product ${String(product?._id || "")} (${title}).`);
    }
    lines.push({
      productId: product?._id ? String(product._id) : "",
      title,
      supplierSource: src,
      qty,
      lineRevenueZar: lineRev,
      supplierCogsZar: Math.round(cogsZar * 100) / 100,
      supplierCogsMissing: missing,
    });
  }

  supplierCogsSum = Math.round(supplierCogsSum * 100) / 100;
  const musicArtistShare = Math.round(((musicRev * MUSIC_OWNER_PCT) / 100) * 100) / 100;
  const musicPlatformShare = Math.round(((musicRev * MUSIC_PLATFORM_PCT) / 100) * 100) / 100;

  const netPlatformCommissionZar = Math.round(
    (total - commissionTotal - supplierCogsSum - musicArtistShare - paygateFee) * 100
  ) / 100;

  return {
    orderId: String((order as any)._id || ""),
    status: String((order as any).status || ""),
    paidAt: (order as any).paidAt ? new Date((order as any).paidAt).toISOString() : null,
    paymentMethod: String((order as any).paymentMethod || ""),
    customerPaidZar: total,
    productSubtotalZar: subtotal,
    musicSubtotalZar: musicRev,
    shippingChargedZar: shipping,
    resellerCommissionZar: commissionTotal,
    paygateFeeZar: paygateFee,
    supplierCogsZar: supplierCogsSum,
    musicArtistShareZar: musicArtistShare,
    musicPlatformShareZar: musicPlatformShare,
    netPlatformCommissionZar: netPlatformCommissionZar,
    lines,
    notes,
  };
}

export async function buildOrderProfitBreakdown(orderId: string): Promise<OrderProfitBreakdown | null> {
  const order = await Order.findById(orderId).populate("items.productId").lean();
  if (!order) return null;
  const { rates } = await getFxRates();
  return computeOrderProfitFromLoadedOrder(order as any, rates);
}

export type DropshippingReportBucket = {
  key: string;
  orderCount: number;
  customerPaidZar: number;
  supplierCogsZar: number;
  shippingChargedZar: number;
  resellerCommissionZar: number;
  paygateFeesZar: number;
  musicArtistShareZar: number;
  musicPlatformShareZar: number;
  netPlatformCommissionZar: number;
};

export async function aggregateDropshippingReport(params: {
  from: Date;
  to: Date;
  groupBy: "day" | "month";
}): Promise<{
  from: string;
  to: string;
  groupBy: "day" | "month";
  totals: Omit<DropshippingReportBucket, "key">;
  buckets: DropshippingReportBucket[];
}> {
  const { from, to, groupBy } = params;
  const { rates } = await getFxRates();

  const orders = await Order.find({
    status: { $in: ["paid", "processing", "shipped", "delivered"] },
    paidAt: { $gte: from, $lte: to },
  })
    .populate("items.productId")
    .sort({ paidAt: 1 })
    .lean();

  const bucketMap = new Map<string, DropshippingReportBucket>();

  const totals = {
    orderCount: 0,
    customerPaidZar: 0,
    supplierCogsZar: 0,
    shippingChargedZar: 0,
    resellerCommissionZar: 0,
    paygateFeesZar: 0,
    musicArtistShareZar: 0,
    musicPlatformShareZar: 0,
    netPlatformCommissionZar: 0,
  };

  function bucketKey(date: Date): string {
    if (groupBy === "month") {
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    return date.toISOString().slice(0, 10);
  }

  for (const o of orders) {
    const b = computeOrderProfitFromLoadedOrder(o as any, rates);
    const paid = (o as any).paidAt ? new Date((o as any).paidAt) : new Date((o as any).createdAt);
    const key = bucketKey(paid);

    totals.orderCount += 1;
    totals.customerPaidZar += b.customerPaidZar;
    totals.supplierCogsZar += b.supplierCogsZar;
    totals.shippingChargedZar += b.shippingChargedZar;
    totals.resellerCommissionZar += b.resellerCommissionZar;
    totals.paygateFeesZar += b.paygateFeeZar;
    totals.musicArtistShareZar += b.musicArtistShareZar;
    totals.musicPlatformShareZar += b.musicPlatformShareZar;
    totals.netPlatformCommissionZar += b.netPlatformCommissionZar;

    const prev = bucketMap.get(key) || {
      key,
      orderCount: 0,
      customerPaidZar: 0,
      supplierCogsZar: 0,
      shippingChargedZar: 0,
      resellerCommissionZar: 0,
      paygateFeesZar: 0,
      musicArtistShareZar: 0,
      musicPlatformShareZar: 0,
      netPlatformCommissionZar: 0,
    };
    prev.orderCount += 1;
    prev.customerPaidZar += b.customerPaidZar;
    prev.supplierCogsZar += b.supplierCogsZar;
    prev.shippingChargedZar += b.shippingChargedZar;
    prev.resellerCommissionZar += b.resellerCommissionZar;
    prev.paygateFeesZar += b.paygateFeeZar;
    prev.musicArtistShareZar += b.musicArtistShareZar;
    prev.musicPlatformShareZar += b.musicPlatformShareZar;
    prev.netPlatformCommissionZar += b.netPlatformCommissionZar;
    bucketMap.set(key, prev);
  }

  const roundBucket = (x: DropshippingReportBucket): DropshippingReportBucket => ({
    ...x,
    customerPaidZar: Math.round(x.customerPaidZar * 100) / 100,
    supplierCogsZar: Math.round(x.supplierCogsZar * 100) / 100,
    shippingChargedZar: Math.round(x.shippingChargedZar * 100) / 100,
    resellerCommissionZar: Math.round(x.resellerCommissionZar * 100) / 100,
    paygateFeesZar: Math.round(x.paygateFeesZar * 100) / 100,
    musicArtistShareZar: Math.round(x.musicArtistShareZar * 100) / 100,
    musicPlatformShareZar: Math.round(x.musicPlatformShareZar * 100) / 100,
    netPlatformCommissionZar: Math.round(x.netPlatformCommissionZar * 100) / 100,
  });

  const buckets = Array.from(bucketMap.values())
    .map(roundBucket)
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    groupBy,
    totals: {
      orderCount: totals.orderCount,
      customerPaidZar: Math.round(totals.customerPaidZar * 100) / 100,
      supplierCogsZar: Math.round(totals.supplierCogsZar * 100) / 100,
      shippingChargedZar: Math.round(totals.shippingChargedZar * 100) / 100,
      resellerCommissionZar: Math.round(totals.resellerCommissionZar * 100) / 100,
      paygateFeesZar: Math.round(totals.paygateFeesZar * 100) / 100,
      musicArtistShareZar: Math.round(totals.musicArtistShareZar * 100) / 100,
      musicPlatformShareZar: Math.round(totals.musicPlatformShareZar * 100) / 100,
      netPlatformCommissionZar: Math.round(totals.netPlatformCommissionZar * 100) / 100,
    },
    buckets,
  };
}
