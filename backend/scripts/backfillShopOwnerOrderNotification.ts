/**
 * Backfill durable in-app shop-owner notification for a paid order.
 *
 * Usage (from backend/):
 *   npx ts-node --transpile-only scripts/backfillShopOwnerOrderNotification.ts ORDER-6a71614f2bce98fb7cbb767f
 *   npx ts-node --transpile-only scripts/backfillShopOwnerOrderNotification.ts 6a71614f2bce98fb7cbb767f
 *   npx ts-node --transpile-only scripts/backfillShopOwnerOrderNotification.ts --phone +27720570259
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import Order from "../src/data/models/Order";
import Product from "../src/data/models/Product";
import Supplier from "../src/data/models/Supplier";
import Store from "../src/data/models/Store";
import User from "../src/data/models/User";
import { formatOrderNumber } from "../src/services/orderNotification";
import { ensureShopOwnerInAppOrderNotification } from "../src/services/shopOwnerOrderNotify";
import { productIsInstorePickup } from "../src/config/foodMarketplace";
import { formatPhoneE164 } from "../src/utils/phoneE164";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function parseOrderIdArg(raw: string): string {
  const s = String(raw || "").trim();
  if (s.toUpperCase().startsWith("ORDER-")) return s.slice(6);
  return s;
}

async function resolveOwnerByPhone(phoneRaw: string) {
  const e164 = formatPhoneE164(phoneRaw) || phoneRaw;
  const digits = e164.replace(/\D/g, "");
  const users = await User.find({
    $or: [
      { phone: e164 },
      { phone: phoneRaw },
      { phone: `+${digits}` },
      { phone: digits },
      { phone: `0${digits.slice(-9)}` },
    ],
  })
    .select("_id username name phone")
    .lean();
  return { e164, users };
}

async function run() {
  const mongoUri = String(process.env.MONGO_URI || "").trim();
  if (!mongoUri) throw new Error("MONGO_URI missing");

  const args = process.argv.slice(2);
  const phoneIdx = args.indexOf("--phone");
  const phoneArg = phoneIdx >= 0 ? String(args[phoneIdx + 1] || "").trim() : "";
  const orderArg = args.find((a, i) => i !== phoneIdx && i !== phoneIdx + 1 && !a.startsWith("--"));

  await mongoose.connect(mongoUri);
  try {
    if (phoneArg) {
      const { e164, users } = await resolveOwnerByPhone(phoneArg);
      console.log(JSON.stringify({ phone: phoneArg, e164, users }, null, 2));
    }

    if (!orderArg) {
      if (phoneArg) return;
      throw new Error(
        "Usage: npx ts-node --transpile-only scripts/backfillShopOwnerOrderNotification.ts <ORDER-id|objectId> [--phone +27...]"
      );
    }

    const orderId = parseOrderIdArg(orderArg);
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw new Error(`Invalid order id: ${orderId}`);
    }

    const order = await Order.findById(orderId)
      .populate("buyerId", "name phone username")
      .lean();
    if (!order) throw new Error(`Order not found: ${orderId}`);

    const orderNumber = formatOrderNumber(orderId);
    const productIds = (order.items || []).map((it) => it.productId);
    const products = await Product.find({ _id: { $in: productIds } })
      .select("title supplierId categories tags")
      .lean();

    const bySupplier = new Map<string, { lines: Array<{ title: string; qty: number }>; food: boolean }>();
    for (const it of order.items || []) {
      const p = products.find((x) => String(x._id) === String(it.productId));
      if (!p) continue;
      const sid = String((p as { supplierId?: unknown }).supplierId || "");
      if (!sid) continue;
      const row = bySupplier.get(sid) || { lines: [], food: false };
      row.lines.push({ title: String((p as { title?: string }).title || "Item"), qty: Number(it.qty || 1) });
      if (productIsInstorePickup(p as { categories?: string[]; tags?: string[] })) row.food = true;
      bySupplier.set(sid, row);
    }

    const buyer = order.buyerId as { name?: string; username?: string } | null;
    const results: unknown[] = [];

    for (const [supplierId, bundle] of bySupplier.entries()) {
      const supplier = await Supplier.findById(supplierId).select("userId storeName").lean();
      const ownerId = (supplier as { userId?: mongoose.Types.ObjectId } | null)?.userId;
      if (!ownerId) {
        results.push({ supplierId, error: "no_owner" });
        continue;
      }
      const owner = await User.findById(ownerId).select("username name phone").lean();
      const store =
        (await Store.findOne({ supplierId: new mongoose.Types.ObjectId(supplierId) })
          .select("name whatsapp cellphone")
          .lean()) ||
        (await Store.findOne({ userId: ownerId, type: "supplier" })
          .select("name whatsapp cellphone")
          .lean());
      const storeName =
        String((store as { name?: string } | null)?.name || "").trim() ||
        String((supplier as { storeName?: string } | null)?.storeName || "Store");
      const itemSummary = bundle.lines.map((l) => `${l.qty}x ${l.title}`).join(", ").slice(0, 200);
      const buyerLabel =
        String(buyer?.name || "").trim() ||
        (buyer?.username ? `@${buyer.username}` : "") ||
        "Customer";
      const message = `${storeName}: ${buyerLabel} bought ${itemSummary} — ${orderNumber}. Open Shop Orders to prepare.`.slice(
        0,
        500
      );

      const inApp = await ensureShopOwnerInAppOrderNotification({
        ownerId: String(ownerId),
        type: bundle.food ? "food_shop_order" : "shop_order",
        message,
        meta: {
          orderId: String(orderId),
          supplierId,
          orderNumber,
          storeName,
          itemSummary,
          url: "/store/orders",
        },
      });

      if (inApp.notificationId) {
        await Order.updateOne(
          { _id: orderId },
          {
            $set: {
              [`foodMerchantAlerts.${supplierId}.inAppNotificationId`]: inApp.notificationId,
              [`foodMerchantAlerts.${supplierId}.inAppNotifiedAt`]: new Date(),
            },
          }
        );
      }

      results.push({
        supplierId,
        storeName,
        owner: owner
          ? { _id: String(owner._id), username: owner.username, name: owner.name, phone: owner.phone }
          : null,
        notificationId: inApp.notificationId,
        created: inApp.created,
        type: bundle.food ? "food_shop_order" : "shop_order",
      });
    }

    console.log(
      JSON.stringify(
        {
          orderId,
          orderNumber,
          status: order.status,
          results,
        },
        null,
        2
      )
    );
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
