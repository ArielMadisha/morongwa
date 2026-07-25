import mongoose from "mongoose";
import Order from "../data/models/Order";
import Product from "../data/models/Product";
import Supplier from "../data/models/Supplier";
import Store from "../data/models/Store";
import User from "../data/models/User";
import Wallet from "../data/models/Wallet";
import { productIsInstorePickup } from "../config/foodMarketplace";
import { sendSms } from "./otpDelivery";
import { formatOrderNumber } from "./orderNotification";
import { logger } from "./monitoring";
import { formatPhoneE164 } from "../utils/phoneE164";

/**
 * After food/grocery pickup order is paid:
 * 1) Credit restaurant/store owner wallet (ledger inside Qwertymates — funds already in platform bank)
 * 2) SMS + WhatsApp the store with order details for kitchen/shop prep & customer collection
 *
 * WhatsApp freeform often fails with Twilio 63016 outside the 24h session window — SMS is the
 * reliable channel so merchants always get the order details.
 */
export async function settleFoodPickupOrderPaid(orderId: string): Promise<void> {
  const order = await Order.findById(orderId)
    .populate("buyerId", "name phone username email")
    .lean();
  if (!order || String(order.status).toLowerCase() !== "paid") return;

  const productIds = (order.items || []).map((it) => it.productId);
  const products = await Product.find({ _id: { $in: productIds } })
    .select("title supplierId categories tags")
    .lean();
  if (!products.length || !products.every((p) => productIsInstorePickup(p))) return;

  const productMap = new Map(products.map((p) => [String(p._id), p]));
  const bySupplier = new Map<
    string,
    { amount: number; lines: Array<{ title: string; qty: number; price: number }> }
  >();

  for (const it of order.items || []) {
    const p = productMap.get(String(it.productId));
    if (!p) continue;
    const sid = String((p as { supplierId?: unknown }).supplierId || "");
    if (!sid) continue;
    const row = bySupplier.get(sid) || { amount: 0, lines: [] };
    const unitPrice = Number(it.price || 0);
    const feePerUnit = Math.max(0, Number((it as { foodServiceFeeZar?: number }).foodServiceFeeZar || 0));
    // Store receives catalog amount only — platform keeps the service fee.
    const storeUnit = Math.max(0, Math.round((unitPrice - feePerUnit) * 100) / 100);
    const qty = Number(it.qty || 1);
    const line = storeUnit * qty;
    row.amount += line;
    row.lines.push({
      title: String((p as { title?: string }).title || "Item"),
      qty,
      price: storeUnit,
    });
    bySupplier.set(sid, row);
  }

  const orderNumber = formatOrderNumber(orderId);
  const buyer = order.buyerId as {
    name?: string;
    phone?: string;
    username?: string;
    email?: string;
  } | null;
  const creditRefBase = `FOOD-CREDIT-${orderId}`;
  const existingAlerts =
    ((order as { foodMerchantAlerts?: Record<string, { smsSid?: string; waSid?: string }> })
      .foodMerchantAlerts || {}) as Record<string, { smsSid?: string; waSid?: string; phone?: string }>;

  for (const [supplierId, bundle] of bySupplier.entries()) {
    const amount = Math.round(bundle.amount * 100) / 100;

    const supplier = await Supplier.findById(supplierId).select("userId storeName").lean();
    const ownerId = (supplier as { userId?: mongoose.Types.ObjectId } | null)?.userId;
    if (!ownerId) continue;

    if (amount > 0) {
      let wallet = await Wallet.findOne({ user: ownerId });
      if (!wallet) wallet = await Wallet.create({ user: ownerId, balance: 0, transactions: [] });

      const already = (wallet.transactions || []).some(
        (t) => String((t as { reference?: string }).reference || "") === `${creditRefBase}-${supplierId}`
      );
      if (!already) {
        wallet.balance = Math.round((Number(wallet.balance || 0) + amount) * 100) / 100;
        wallet.transactions.push({
          type: "credit",
          amount,
          reference: `${creditRefBase}-${supplierId}`,
          createdAt: new Date(),
        } as never);
        await wallet.save();
        logger.info("Food store wallet credited", {
          orderId,
          supplierId,
          ownerId: String(ownerId),
          amount,
        });
      }
    }

    const prior = existingAlerts[supplierId];
    if (prior?.smsSid) {
      // Already delivered merchant SMS for this supplier on this order (webhook retry).
      continue;
    }

    const store =
      (await Store.findOne({ supplierId: new mongoose.Types.ObjectId(supplierId) })
        .select("name whatsapp cellphone")
        .lean()) ||
      (await Store.findOne({ userId: ownerId, type: "supplier" })
        .select("name whatsapp cellphone")
        .lean());

    const owner = await User.findById(ownerId).select("phone").lean();
    const rawPhone =
      String((store as { whatsapp?: string } | null)?.whatsapp || "").trim() ||
      String((store as { cellphone?: string } | null)?.cellphone || "").trim() ||
      String((owner as { phone?: string } | null)?.phone || "").trim();
    const phone = formatPhoneE164(rawPhone) || rawPhone;
    if (!phone) {
      logger.warn("Food store order alert skipped — no phone", { orderId, supplierId });
      continue;
    }

    const storeName =
      String((store as { name?: string } | null)?.name || "").trim() ||
      String((supplier as { storeName?: string } | null)?.storeName || "Store");

    const itemLines = bundle.lines.map((l) => `• ${l.qty}× ${l.title} @ R${l.price.toFixed(2)}`);
    const alertText = [
      `${storeName} — NEW ORDER ${orderNumber}`,
      `Status: PAID (Qwertymates / ACBPay)`,
      `Collection: Customer will collect`,
      `Buyer: ${buyer?.name || "—"}`,
      buyer?.phone ? `Buyer phone: ${buyer.phone}` : null,
      buyer?.username ? `Username: @${buyer.username}` : null,
      amount > 0 ? `Total credited to your wallet: R${amount.toFixed(2)}` : null,
      "",
      "Items:",
      ...itemLines,
      "",
      "Please prepare the order. Customer collects when ready.",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1500);

    let smsSid: string | undefined;
    let waSid: string | undefined;

    // SMS first — reliable for kitchen prep when WhatsApp session is closed (Twilio 63016).
    try {
      const sms = await sendSms({ phone, text: alertText, channel: "sms" });
      smsSid = sms.sid;
      logger.info("Food store SMS sent", {
        orderId,
        phone,
        sid: sms.sid,
        provider: sms.provider,
      });
    } catch (err) {
      logger.warn("Food store SMS failed (non-fatal)", {
        orderId,
        phone,
        error: String((err as Error)?.message || err),
      });
    }

    // WhatsApp best-effort (delivers when customer care window is open).
    try {
      const wa = await sendSms({ phone, text: alertText, channel: "whatsapp" });
      waSid = wa.sid;
      logger.info("Food store WhatsApp sent", {
        orderId,
        phone,
        sid: wa.sid,
        provider: wa.provider,
      });
    } catch (err) {
      logger.warn("Food store WhatsApp failed (non-fatal)", {
        orderId,
        phone,
        error: String((err as Error)?.message || err),
      });
    }

    if (smsSid || waSid) {
      await Order.updateOne(
        { _id: orderId },
        {
          $set: {
            [`foodMerchantAlerts.${supplierId}`]: {
              smsSid,
              waSid,
              phone,
              notifiedAt: new Date(),
            },
          },
        }
      );
    } else {
      logger.warn("Food store order alert failed on all channels", { orderId, supplierId, phone });
    }
  }
}
