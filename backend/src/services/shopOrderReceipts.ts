import mongoose from "mongoose";
import Order from "../data/models/Order";
import Product from "../data/models/Product";
import User from "../data/models/User";
import { productIsInstorePickup } from "../config/foodMarketplace";
import { listApprovedSupplierProfilesForUser } from "../utils/supplierAccess";
import { formatOrderNumber } from "./orderNotification";
import { AppError } from "../middleware/errorHandler";

export type ShopPrepStatus = "new" | "preparing" | "ready" | "collected";

const PREP_STATUSES: ShopPrepStatus[] = ["new", "preparing", "ready", "collected"];

export function isShopPrepStatus(v: string): v is ShopPrepStatus {
  return PREP_STATUSES.includes(v as ShopPrepStatus);
}

export type ShopOrderReceipt = {
  orderId: string;
  orderNumber: string;
  supplierId: string;
  storeName?: string;
  status: string;
  prepStatus: ShopPrepStatus;
  paidAt?: string | null;
  createdAt?: string | null;
  paymentMethod?: string;
  collection: boolean;
  buyer: { name?: string; phone?: string; username?: string } | null;
  items: Array<{
    productId: string;
    title: string;
    qty: number;
    unitPrice: number;
    foodServiceFeeZar: number;
    storeUnitPrice: number;
  }>;
  storeCreditZar: number;
  customerTotalZar: number;
};

async function approvedSupplierIdsForUser(userId: string): Promise<
  Array<{ _id: mongoose.Types.ObjectId; storeName?: string }>
> {
  const profiles = await listApprovedSupplierProfilesForUser(userId);
  return profiles.map((p) => ({ _id: p._id, storeName: p.storeName }));
}

function prepStatusFor(
  order: { shopPrepBySupplier?: Record<string, { status?: string }>; status?: string },
  supplierId: string
): ShopPrepStatus {
  const raw = String(order.shopPrepBySupplier?.[supplierId]?.status || "").toLowerCase();
  if (isShopPrepStatus(raw)) return raw;
  const st = String(order.status || "").toLowerCase();
  if (st === "processing") return "preparing";
  if (st === "delivered" || st === "shipped") return "collected";
  return "new";
}

export async function listShopOrderReceiptsForUser(options: {
  userId: string;
  limit?: number;
  status?: string;
}): Promise<ShopOrderReceipt[]> {
  const { userId } = options;
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
  const suppliers = await approvedSupplierIdsForUser(userId);
  if (!suppliers.length) return [];

  const supplierIds = suppliers.map((s) => s._id);
  const supplierName = new Map(suppliers.map((s) => [String(s._id), s.storeName || ""]));

  const productRows = await Product.find({ supplierId: { $in: supplierIds } })
    .select("_id supplierId title categories tags")
    .lean();
  if (!productRows.length) return [];

  const productById = new Map(productRows.map((p) => [String(p._id), p]));
  const productIds = productRows.map((p) => p._id);

  const statusFilter = String(options.status || "").trim().toLowerCase();
  const query: Record<string, unknown> = {
    "items.productId": { $in: productIds },
    status: { $in: ["paid", "processing", "shipped", "delivered"] },
  };
  if (statusFilter && statusFilter !== "all") {
    if (isShopPrepStatus(statusFilter)) {
      // Filter by prep status in memory below; keep paid+ statuses in DB query.
    } else {
      query.status = statusFilter;
    }
  }

  const orders = await Order.find(query)
    .sort({ paidAt: -1, createdAt: -1 })
    .limit(limit * 3)
    .lean();

  const buyerIds = [...new Set(orders.map((o) => String(o.buyerId)))].filter(Boolean);
  const buyers = await User.find({ _id: { $in: buyerIds } })
    .select("name phone username")
    .lean();
  const buyerMap = new Map(buyers.map((b) => [String(b._id), b]));

  const out: ShopOrderReceipt[] = [];

  for (const order of orders) {
    const bySupplier = new Map<
      string,
      {
        items: ShopOrderReceipt["items"];
        storeCreditZar: number;
        customerTotalZar: number;
      }
    >();

    for (const it of order.items || []) {
      const pid = String(it.productId);
      const product = productById.get(pid);
      if (!product) continue;
      const sid = String((product as { supplierId?: unknown }).supplierId || "");
      if (!sid || !supplierName.has(sid)) continue;

      const unitPrice = Number(it.price || 0);
      const fee = Math.max(0, Number((it as { foodServiceFeeZar?: number }).foodServiceFeeZar || 0));
      const storeUnit = Math.max(0, Math.round((unitPrice - fee) * 100) / 100);
      const qty = Number(it.qty || 1);
      const row = bySupplier.get(sid) || { items: [], storeCreditZar: 0, customerTotalZar: 0 };
      row.items.push({
        productId: pid,
        title: String((product as { title?: string }).title || "Item"),
        qty,
        unitPrice,
        foodServiceFeeZar: fee,
        storeUnitPrice: storeUnit,
      });
      row.storeCreditZar += storeUnit * qty;
      row.customerTotalZar += unitPrice * qty;
      bySupplier.set(sid, row);
    }

    const buyer = buyerMap.get(String(order.buyerId)) || null;
    const collection =
      String(order.delivery?.method || "").toLowerCase() === "collection" ||
      (order.items || []).every((it) => {
        const p = productById.get(String(it.productId));
        return p ? productIsInstorePickup(p) : false;
      });

    for (const [sid, bundle] of bySupplier.entries()) {
      const prepStatus = prepStatusFor(
        order as { shopPrepBySupplier?: Record<string, { status?: string }>; status?: string },
        sid
      );
      if (isShopPrepStatus(statusFilter) && prepStatus !== statusFilter) continue;

      out.push({
        orderId: String(order._id),
        orderNumber: formatOrderNumber(String(order._id)),
        supplierId: sid,
        storeName: supplierName.get(sid) || undefined,
        status: String(order.status || ""),
        prepStatus,
        paidAt: order.paidAt ? new Date(order.paidAt).toISOString() : null,
        createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : null,
        paymentMethod: order.paymentMethod,
        collection,
        buyer: buyer
          ? {
              name: buyer.name,
              phone: buyer.phone,
              username: buyer.username,
            }
          : null,
        items: bundle.items,
        storeCreditZar: Math.round(bundle.storeCreditZar * 100) / 100,
        customerTotalZar: Math.round(bundle.customerTotalZar * 100) / 100,
      });
    }

    if (out.length >= limit) break;
  }

  return out.slice(0, limit);
}

export async function updateShopOrderPrepStatus(options: {
  userId: string;
  orderId: string;
  supplierId?: string;
  prepStatus: ShopPrepStatus;
}): Promise<ShopOrderReceipt> {
  const { userId, orderId, prepStatus } = options;
  if (!mongoose.isValidObjectId(orderId)) throw new AppError("Invalid order id", 400);
  if (!isShopPrepStatus(prepStatus)) throw new AppError("Invalid prep status", 400);

  const suppliers = await approvedSupplierIdsForUser(userId);
  if (!suppliers.length) throw new AppError("Not an approved supplier", 403);

  const allowed = new Set(suppliers.map((s) => String(s._id)));
  let supplierId = String(options.supplierId || "").trim();
  if (supplierId && !allowed.has(supplierId)) {
    throw new AppError("Supplier profile not found for this account", 403);
  }

  const order = await Order.findById(orderId);
  if (!order) throw new AppError("Order not found", 404);
  if (!["paid", "processing", "shipped", "delivered"].includes(String(order.status))) {
    throw new AppError("Order is not available for shop prep yet", 400);
  }

  const productIds = (order.items || []).map((it) => it.productId);
  const products = await Product.find({ _id: { $in: productIds } })
    .select("supplierId")
    .lean();
  const orderSupplierIds = [
    ...new Set(
      products
        .map((p) => String((p as { supplierId?: unknown }).supplierId || ""))
        .filter((id) => allowed.has(id))
    ),
  ];
  if (!orderSupplierIds.length) throw new AppError("This order is not for your shop", 403);

  if (!supplierId) {
    if (orderSupplierIds.length > 1) {
      throw new AppError("supplierId is required when the order spans multiple of your shops", 400);
    }
    supplierId = orderSupplierIds[0];
  } else if (!orderSupplierIds.includes(supplierId)) {
    throw new AppError("This order is not for that shop", 403);
  }

  const now = new Date();
  const prev = (order as { shopPrepBySupplier?: Record<string, { seenAt?: Date }> }).shopPrepBySupplier?.[
    supplierId
  ];
  (order as any).shopPrepBySupplier = {
    ...((order as any).shopPrepBySupplier || {}),
    [supplierId]: {
      status: prepStatus,
      updatedAt: now,
      seenAt: prev?.seenAt || now,
    },
  };

  // Keep top-level order status loosely aligned for single-shop pickup carts.
  if (prepStatus === "preparing" && order.status === "paid") {
    order.status = "processing";
  } else if (prepStatus === "collected" && ["paid", "processing", "shipped"].includes(order.status)) {
    order.status = "delivered";
  } else if (prepStatus === "ready" && order.status === "paid") {
    order.status = "processing";
  }

  await order.save();

  const list = await listShopOrderReceiptsForUser({ userId, limit: 100 });
  const row = list.find((r) => r.orderId === orderId && r.supplierId === supplierId);
  if (!row) throw new AppError("Order updated but could not reload receipt", 500);
  return row;
}
