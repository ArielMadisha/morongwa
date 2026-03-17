/**
 * Order forwarding to external suppliers (CJ, Spocket, EPROLO)
 * Called when order is paid and contains external products
 */

import Order from "../data/models/Order";
import Product from "../data/models/Product";
import CourierRule from "../data/models/CourierRule";
import { getSupplierAdapter } from "./suppliers/supplierService";
import type { IOrder } from "../data/models/Order";

export interface ForwardResult {
  orderId: string;
  externalOrderId?: string;
  externalSupplierId?: string;
  success: boolean;
  message?: string;
}

export async function forwardOrderToExternalSupplier(orderId: string): Promise<ForwardResult[]> {
  const order = await Order.findById(orderId)
    .populate("items.productId")
    .lean();
  if (!order || order.status !== "paid") {
    return [];
  }

  const results: ForwardResult[] = [];
  const bySupplier = new Map<string, { productId: string; vid?: string; sku?: string; qty: number; price: number }[]>();

  for (const item of order.items || []) {
    const product = (item as any).productId;
    if (!product) continue;
    const src = product.supplierSource;
    if (!src || src === "internal") continue;

    const extId = product.externalSupplierId?.toString();
    if (!extId) continue;

    const ext = product.externalData || {};
    const firstVariant = Array.isArray(ext.variants) ? ext.variants[0] : null;
    const vid = firstVariant?.vid || ext.defaultVariantId;
    const sku = firstVariant?.variantSku || product.sku;

    const arr = bySupplier.get(extId) || [];
    // CJ expects unitPrice in USD (supplier cost). Order stores ZAR; use product.supplierCost for CJ.
    const unitPriceUsd = product.supplierCost ?? item.price;
    arr.push({
      productId: product._id.toString(),
      vid,
      sku,
      qty: item.qty,
      price: unitPriceUsd,
    });
    bySupplier.set(extId, arr);
  }

  if (bySupplier.size === 0) return [];

  const delivery = order.delivery as any;
  const address = delivery?.address || "";
  const [line1, ...rest] = address.split(",").map((s: string) => s.trim());
  const countryCode = delivery?.countryCode || parseCountryFromAddress(address) || "ZA";

  const courierRule = await CourierRule.findOne({ country: countryCode, active: true }).lean();
  const logisticName = courierRule?.courier || "DHL";
  const fromCountryCode = courierRule?.preferredSupplier === "cj" ? "CN" : "CN";

  for (const [extSupplierId, items] of bySupplier) {
    const adapter = await getSupplierAdapter("cj");
    if (!adapter) {
      results.push({
        orderId,
        success: false,
        message: "CJ adapter not available",
      });
      continue;
    }

    const products = items.map((it, i) => ({
      variantId: it.vid,
      variantSku: it.sku,
      quantity: it.qty,
      unitPrice: it.price,
      storeLineItemId: `order-${orderId}-${i}`,
    }));

    if (products.some((p) => !p.variantId && !p.variantSku)) {
      results.push({
        orderId,
        externalSupplierId: extSupplierId,
        success: false,
        message: "Product missing variant ID/SKU for CJ",
      });
      continue;
    }

    try {
      const res = await adapter.createOrder({
        orderNumber: `QM-${orderId}`,
        shipping: {
          name: "Customer",
          address: line1 || address,
          address2: rest.join(", "),
          city: "City",
          province: "Province",
          country: countryCode,
          countryCode,
          zip: "",
          phone: delivery?.phone,
        },
        products,
        logisticName,
        fromCountryCode,
        remark: `Qwertymates order ${orderId}`,
      });

      if (res.orderId) {
        await Order.updateOne(
          { _id: orderId },
          {
            $set: {
              externalOrderId: res.orderId,
              externalSupplierId: new (await import("mongoose")).Types.ObjectId(extSupplierId),
              status: "processing",
            },
          }
        );
      }

      results.push({
        orderId,
        externalOrderId: res.orderId,
        externalSupplierId: extSupplierId,
        success: res.success,
        message: res.message,
      });
    } catch (err: any) {
      results.push({
        orderId,
        externalSupplierId: extSupplierId,
        success: false,
        message: err?.message || "Forward failed",
      });
    }
  }

  return results;
}

function parseCountryFromAddress(addr: string): string | null {
  const codes: Record<string, string> = {
    "south africa": "ZA",
    "zambia": "ZM",
    "botswana": "BW",
    "namibia": "NA",
    "lesotho": "LS",
    "zimbabwe": "ZW",
    "mozambique": "MZ",
    "germany": "DE",
    "france": "FR",
    "united states": "US",
    "united kingdom": "GB",
  };
  const lower = addr.toLowerCase();
  for (const [name, code] of Object.entries(codes)) {
    if (lower.includes(name)) return code;
  }
  return null;
}
