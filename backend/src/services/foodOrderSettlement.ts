import mongoose from "mongoose";
import Order from "../data/models/Order";
import Product from "../data/models/Product";
import Supplier from "../data/models/Supplier";
import Store from "../data/models/Store";
import User from "../data/models/User";
import Wallet from "../data/models/Wallet";
import { productIsInstorePickup } from "../config/foodMarketplace";
import { sendSms, zaSmsSenderMissingForDigits } from "./otpDelivery";
import { formatOrderNumber } from "./orderNotification";
import { sendExpoPushToUser } from "./expoPush";
import { ensureShopOwnerInAppOrderNotification } from "./shopOwnerOrderNotify";
import { logger } from "./monitoring";
import { formatPhoneE164, canonicalPhoneDigits } from "../utils/phoneE164";
import { resolveWhatsappSendProfile } from "../utils/twilioWaCredentials";
import twilio from "twilio";

type FoodMerchantAlert = {
  waSid?: string;
  phone?: string;
  notifiedAt?: Date;
  provider?: string;
  error?: string;
  /** Twilio message status after poll (delivered | undelivered | sent | …). */
  deliveryStatus?: string;
  /** Last-resort SMS when WhatsApp is undelivered (Meta template pending / 63016). */
  smsSid?: string;
  /** Twilio SMS From used for last-resort (prefer TWILIO_SMS_FROM_ZA for +27). */
  smsFrom?: string;
  pushTicketId?: string;
  pushNotifiedAt?: Date;
  pushError?: string;
  /** In-app Activity notification id (durable fallback when WA/push fail). */
  inAppNotificationId?: string;
  inAppNotifiedAt?: Date;
};

const WA_DELIVERY_OK = new Set(["delivered", "read"]);
const WA_DELIVERY_FAIL = new Set(["undelivered", "failed", "canceled"]);

/**
 * Twilio accepts freeform WhatsApp outside the 24h window and returns a SID, then flips to
 * undelivered with error 63016. Treat SID alone as success only after a short delivery poll.
 */
async function waitForTwilioWaDelivery(
  client: ReturnType<typeof twilio>,
  sid: string,
  opts?: { timeoutMs?: number; intervalMs?: number }
): Promise<{ status: string; errorCode: number | null }> {
  const timeoutMs = opts?.timeoutMs ?? 12000;
  const intervalMs = opts?.intervalMs ?? 800;
  const started = Date.now();
  let last = { status: "queued", errorCode: null as number | null };
  while (Date.now() - started < timeoutMs) {
    const msg = await client.messages(sid).fetch();
    last = {
      status: String(msg.status || ""),
      errorCode: msg.errorCode != null ? Number(msg.errorCode) : null,
    };
    if (WA_DELIVERY_OK.has(last.status) || WA_DELIVERY_FAIL.has(last.status)) {
      return last;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}

function waDeliveryFailed(delivery: { status: string; errorCode: number | null }): boolean {
  if (WA_DELIVERY_FAIL.has(delivery.status)) return true;
  if (delivery.errorCode === 63016 || delivery.errorCode === 63024) return true;
  return false;
}

function merchantWaAlreadyDelivered(prior?: FoodMerchantAlert): boolean {
  if (!prior?.waSid || prior.error) return false;
  const status = String(prior.deliveryStatus || "").toLowerCase();
  if (status === "undelivered" || status === "failed" || status === "canceled") return false;
  // Legacy rows recorded SID without polling — do not treat as delivered.
  if (!status) return false;
  return WA_DELIVERY_OK.has(status) || status === "sent";
}

/**
 * After food/grocery order is paid (collection OR delivery):
 * 1) Credit restaurant/store owner wallet for pickup/collection lines (ledger inside Qwertymates)
 * 2) Durable in-app Activity notification for the store owner (always — Meta-independent)
 * 3) WhatsApp the store with order details (mandatory — never treat DB-only as sent)
 * 4) Expo push to store owner device(s) when they have registered tokens (non-blocking)
 *
 * Freeform WhatsApp may fail with Twilio 63016 outside the 24h session window until the merchant
 * messages Qwertymates first. `TWILIO_WA_ORDER_ALERT_CONTENT_SID` is REQUIRED as template fallback
 * (Meta-approved utility: 1=storeName, 2=orderNumber, 3=buyerName, 4=itemSummary).
 * Prefer template when configured; always poll Twilio status — never treat SID alone as delivered.
 */
async function sendMerchantOrderWhatsApp(params: {
  phone: string;
  alertText: string;
  storeName: string;
  orderNumber: string;
  buyerName: string;
  itemSummary: string;
  orderId: string;
  supplierId: string;
}): Promise<{ sid: string; provider: string; deliveryStatus: string }> {
  const { phone, alertText, storeName, orderNumber, buyerName, itemSummary, orderId, supplierId } =
    params;
  const contentSid = String(process.env.TWILIO_WA_ORDER_ALERT_CONTENT_SID || "").trim();
  const profile = resolveWhatsappSendProfile(null, phone, null);
  if (!profile) {
    throw new Error("WhatsApp send blocked — no Twilio WA profile configured");
  }
  const client = twilio(profile.accountSid, profile.authToken);
  const toRaw = formatPhoneE164(phone) || phone;
  const toWa = `whatsapp:${toRaw.startsWith("+") ? toRaw : `+${toRaw.replace(/\D/g, "")}`}`;

  const sendTemplate = async (): Promise<{ sid: string; provider: string; deliveryStatus: string }> => {
    if (!contentSid) {
      throw new Error("TWILIO_WA_ORDER_ALERT_CONTENT_SID is missing");
    }
    const msg = await client.messages.create({
      to: toWa,
      from: profile.whatsappFrom,
      contentSid,
      contentVariables: JSON.stringify({
        "1": storeName.slice(0, 60),
        "2": orderNumber.slice(0, 40),
        "3": buyerName.slice(0, 60),
        "4": itemSummary.slice(0, 200),
      }),
    });
    const delivery = await waitForTwilioWaDelivery(client, msg.sid);
    if (waDeliveryFailed(delivery)) {
      throw new Error(
        `WhatsApp template undelivered status=${delivery.status} errorCode=${
          delivery.errorCode ?? "none"
        } (Meta template must be approved; 63016 = outside session / template unused)`
      );
    }
    logger.info("Food/grocery store WhatsApp sent via content template", {
      contentSid,
      sid: msg.sid,
      phone,
      orderId,
      supplierId,
      deliveryStatus: delivery.status,
    });
    return {
      sid: msg.sid,
      provider: "twilio_template",
      deliveryStatus: delivery.status,
    };
  };

  const sendFreeform = async (): Promise<{ sid: string; provider: string; deliveryStatus: string }> => {
    const wa = await sendSms({ phone, text: alertText, channel: "whatsapp" });
    const sid = String(wa.sid || `dev-${Date.now()}`);
    const provider = String(wa.provider || "twilio");
    if (provider === "dev" || sid.startsWith("dev-")) {
      return { sid, provider, deliveryStatus: "sent" };
    }
    const delivery = await waitForTwilioWaDelivery(client, sid);
    if (waDeliveryFailed(delivery)) {
      throw new Error(
        `WhatsApp freeform undelivered status=${delivery.status} errorCode=${
          delivery.errorCode ?? "none"
        }`
      );
    }
    return { sid, provider, deliveryStatus: delivery.status };
  };

  // Prefer Meta utility template first (works outside 24h once approved).
  if (contentSid) {
    try {
      return await sendTemplate();
    } catch (templateErr) {
      logger.warn("Food/grocery store WhatsApp template failed — trying freeform", {
        orderId,
        supplierId,
        phone,
        error: String((templateErr as Error)?.message || templateErr),
      });
      try {
        return await sendFreeform();
      } catch (freeformErr) {
        logger.error(
          "Food/grocery store WhatsApp BLOCKED — template and freeform both failed (check Meta Content SID approval)",
          {
            orderId,
            supplierId,
            phone,
            contentSid,
            templateError: String((templateErr as Error)?.message || templateErr),
            freeformError: String((freeformErr as Error)?.message || freeformErr),
          }
        );
        throw new Error(
          `WhatsApp template+freeform failed: ${String(
            (templateErr as Error)?.message || templateErr
          )} | ${String((freeformErr as Error)?.message || freeformErr)}`
        );
      }
    }
  }

  try {
    return await sendFreeform();
  } catch (freeformErr) {
    logger.error(
      "Food/grocery store WhatsApp BLOCKED — freeform failed and TWILIO_WA_ORDER_ALERT_CONTENT_SID is unset",
      {
        orderId,
        supplierId,
        phone,
        freeformError: String((freeformErr as Error)?.message || freeformErr),
      }
    );
    throw new Error(
      `WhatsApp freeform failed and TWILIO_WA_ORDER_ALERT_CONTENT_SID is missing: ${String(
        (freeformErr as Error)?.message || freeformErr
      )}`
    );
  }
}

/** Non-blocking Expo push to store owner. Failures are logged and recorded; never throw. */
async function sendMerchantOrderPush(params: {
  ownerId: string;
  storeName: string;
  orderId: string;
  orderNumber: string;
  supplierId: string;
  amount: number;
  fulfilmentLabel: string;
  isCollection: boolean;
  itemSummary: string;
}): Promise<void> {
  const {
    ownerId,
    storeName,
    orderId,
    orderNumber,
    supplierId,
    amount,
    fulfilmentLabel,
    isCollection,
    itemSummary,
  } = params;

  const title = `${storeName} — New order`;
  const totalBit = amount > 0 ? ` · R${amount.toFixed(2)}` : "";
  const body = `${orderNumber}${totalBit} · ${
    isCollection ? "Collection" : "Delivery"
  } · ${itemSummary || "See Shop Orders"}`.slice(0, 240);

  try {
    const push = await sendExpoPushToUser(String(ownerId), {
      title,
      body,
      data: {
        type: "food_shop_order",
        orderId: String(orderId),
        supplierId: String(supplierId),
        orderNumber,
        storeName,
        fulfilment: isCollection ? "collection" : "delivery",
        url: "/store/orders",
      },
      channelId: "shop-orders",
      priority: "high",
    });

    if (push.noTokens) {
      await Order.updateOne(
        { _id: orderId },
        {
          $set: {
            [`foodMerchantAlerts.${supplierId}.pushError`]: "no_push_token",
            [`foodMerchantAlerts.${supplierId}.pushNotifiedAt`]: new Date(),
          },
        }
      );
      logger.info("Food/grocery store push skipped — owner has no Expo token", {
        orderId,
        supplierId,
        ownerId: String(ownerId),
      });
      return;
    }

    if (push.sent > 0 && push.ticketIds[0]) {
      await Order.updateOne(
        { _id: orderId },
        {
          $set: {
            [`foodMerchantAlerts.${supplierId}.pushTicketId`]: push.ticketIds[0],
            [`foodMerchantAlerts.${supplierId}.pushNotifiedAt`]: new Date(),
          },
          $unset: {
            [`foodMerchantAlerts.${supplierId}.pushError`]: "",
          },
        }
      );
      logger.info("Food/grocery store Expo push sent", {
        orderId,
        supplierId,
        ownerId: String(ownerId),
        sent: push.sent,
        ticketId: push.ticketIds[0],
        fulfilment: fulfilmentLabel,
      });
      return;
    }

    const errMsg = (push.errors[0] || "push_failed").slice(0, 300);
    await Order.updateOne(
      { _id: orderId },
      {
        $set: {
          [`foodMerchantAlerts.${supplierId}.pushError`]: errMsg,
          [`foodMerchantAlerts.${supplierId}.pushNotifiedAt`]: new Date(),
        },
      }
    );
    logger.error("Food/grocery store Expo push FAILED", {
      orderId,
      supplierId,
      ownerId: String(ownerId),
      error: errMsg,
    });
  } catch (err) {
    const errMsg = String((err as Error)?.message || err).slice(0, 300);
    logger.error("Food/grocery store Expo push threw (non-blocking)", {
      orderId,
      supplierId,
      ownerId: String(ownerId),
      error: errMsg,
    });
    try {
      await Order.updateOne(
        { _id: orderId },
        {
          $set: {
            [`foodMerchantAlerts.${supplierId}.pushError`]: errMsg,
            [`foodMerchantAlerts.${supplierId}.pushNotifiedAt`]: new Date(),
          },
        }
      );
    } catch {
      /* ignore */
    }
  }
}

/**
 * Settle paid food/grocery orders: wallet credit (collection/pickup economics) + mandatory
 * WhatsApp merchant alert + Expo push for every food/grocery supplier on the order.
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
  if (!products.length) return;

  // Only food/grocery lines — mixed carts still alert those stores.
  const foodProducts = products.filter((p) => productIsInstorePickup(p));
  if (!foodProducts.length) return;

  const deliveryMethod = String(
    (order as { delivery?: { method?: string } }).delivery?.method || ""
  ).toLowerCase();
  const isCollection = deliveryMethod === "collection";
  const fulfilmentLabel = isCollection
    ? "Collection: Customer will collect"
    : deliveryMethod
      ? `Delivery (${deliveryMethod}): Prepare for dispatch`
      : "Fulfilment: Prepare order (check Shop Orders for collection vs delivery)";

  const productMap = new Map(foodProducts.map((p) => [String(p._id), p]));
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

  if (!bySupplier.size) {
    logger.error("Food/grocery paid order has no supplier lines for WhatsApp alert", { orderId });
    return;
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
    ((order as { foodMerchantAlerts?: Record<string, FoodMerchantAlert> }).foodMerchantAlerts ||
      {}) as Record<string, FoodMerchantAlert>;

  const contentSidConfigured = Boolean(
    String(process.env.TWILIO_WA_ORDER_ALERT_CONTENT_SID || "").trim()
  );
  if (!contentSidConfigured) {
    logger.error(
      "TWILIO_WA_ORDER_ALERT_CONTENT_SID unset — template fallback unavailable; freeform-only may fail outside 24h session",
      { orderId }
    );
  }

  for (const [supplierId, bundle] of bySupplier.entries()) {
    const amount = Math.round(bundle.amount * 100) / 100;

    const supplier = await Supplier.findById(supplierId).select("userId storeName").lean();
    const ownerId = (supplier as { userId?: mongoose.Types.ObjectId } | null)?.userId;
    if (!ownerId) {
      logger.error("Food/grocery WhatsApp skipped — supplier has no owner", { orderId, supplierId });
      await Order.updateOne(
        { _id: orderId },
        {
          $set: {
            [`foodMerchantAlerts.${supplierId}`]: {
              error: "no_supplier_owner",
              notifiedAt: new Date(),
            },
          },
        }
      );
      continue;
    }

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

    // Ensure shop inbox has a prep row for this supplier (QwertyHub Shop Orders).
    await Order.updateOne(
      { _id: orderId, [`shopPrepBySupplier.${supplierId}`]: { $exists: false } },
      {
        $set: {
          [`shopPrepBySupplier.${supplierId}`]: {
            status: "new",
            updatedAt: new Date(),
          },
        },
      }
    );

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

    const itemSummary = bundle.lines
      .map((l) => `${l.qty}x ${l.title}`)
      .join(", ")
      .slice(0, 200);

    const prior = existingAlerts[supplierId];

    // Durable in-app Activity for store owner — independent of WhatsApp / Expo / Meta templates.
    const buyerLabel =
      String(buyer?.name || "").trim() ||
      (buyer?.username ? `@${buyer.username}` : "") ||
      "Customer";
    const inAppMessage = [
      `${storeName}: ${buyerLabel} bought ${itemSummary || "items"}`,
      `${orderNumber} · ${isCollection ? "Collection" : "Delivery"}`,
      amount > 0 ? `Store total R${amount.toFixed(2)}` : null,
      "Open Shop Orders to prepare.",
    ]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 500);

    if (!prior?.inAppNotificationId) {
      const inApp = await ensureShopOwnerInAppOrderNotification({
        ownerId: String(ownerId),
        type: "food_shop_order",
        message: inAppMessage,
        meta: {
          orderId: String(orderId),
          supplierId: String(supplierId),
          orderNumber,
          storeName,
          fulfilment: isCollection ? "collection" : "delivery",
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
    }

    // Expo push — independent of WhatsApp / phone; never blocks settlement.
    if (!prior?.pushTicketId) {
      await sendMerchantOrderPush({
        ownerId: String(ownerId),
        storeName,
        orderId,
        orderNumber,
        supplierId,
        amount,
        fulfilmentLabel,
        isCollection,
        itemSummary,
      });
    }

    // Only skip WA when a prior send was confirmed delivered (SID alone can be undelivered/63016).
    if (merchantWaAlreadyDelivered(prior)) {
      continue;
    }

    const owner = await User.findById(ownerId).select("phone").lean();
    const rawPhone =
      String((store as { whatsapp?: string } | null)?.whatsapp || "").trim() ||
      String((store as { cellphone?: string } | null)?.cellphone || "").trim() ||
      String((owner as { phone?: string } | null)?.phone || "").trim();
    const phone = formatPhoneE164(rawPhone) || rawPhone;
    if (!phone) {
      logger.error("Food/grocery store WhatsApp FAILED — no phone on store/owner", {
        orderId,
        supplierId,
      });
      await Order.updateOne(
        { _id: orderId },
        {
          $set: {
            [`foodMerchantAlerts.${supplierId}.error`]: "no_phone",
            [`foodMerchantAlerts.${supplierId}.notifiedAt`]: new Date(),
          },
        }
      );
      continue;
    }

    const itemLines = bundle.lines.map((l) => `• ${l.qty}× ${l.title} @ R${l.price.toFixed(2)}`);
    const alertText = [
      `${storeName} — NEW ORDER ${orderNumber}`,
      `Status: PAID (Qwertymates / ACBPay)`,
      fulfilmentLabel,
      `Buyer: ${buyer?.name || "—"}`,
      buyer?.phone ? `Buyer phone: ${buyer.phone}` : null,
      buyer?.username ? `Username: @${buyer.username}` : null,
      amount > 0 ? `Store total (ex service fee): R${amount.toFixed(2)}` : null,
      "",
      "Items:",
      ...itemLines,
      "",
      "Open QwertyHub → Shop Orders to prepare this order.",
      isCollection
        ? "Please prepare the order. Customer collects when ready."
        : "Please prepare the order for delivery/dispatch.",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1500);

    try {
      const wa = await sendMerchantOrderWhatsApp({
        phone,
        alertText,
        storeName,
        orderNumber,
        buyerName: String(buyer?.name || "Customer"),
        itemSummary: itemSummary || "See Shop Orders",
        orderId,
        supplierId,
      });
      logger.info("Food/grocery store WhatsApp sent", {
        orderId,
        phone,
        sid: wa.sid,
        provider: wa.provider,
        deliveryStatus: wa.deliveryStatus,
        fulfilment: deliveryMethod || (isCollection ? "collection" : "unspecified"),
      });
      // Granular $set so Expo push fields on the same alert object are preserved.
      await Order.updateOne(
        { _id: orderId },
        {
          $set: {
            [`foodMerchantAlerts.${supplierId}.waSid`]: wa.sid,
            [`foodMerchantAlerts.${supplierId}.phone`]: phone,
            [`foodMerchantAlerts.${supplierId}.notifiedAt`]: new Date(),
            [`foodMerchantAlerts.${supplierId}.provider`]: wa.provider,
            [`foodMerchantAlerts.${supplierId}.deliveryStatus`]: wa.deliveryStatus,
          },
          $unset: {
            [`foodMerchantAlerts.${supplierId}.error`]: "",
          },
        }
      );
    } catch (err) {
      const errMsg = String((err as Error)?.message || err);
      logger.error("Food/grocery store WhatsApp FAILED — merchant did not receive order alert", {
        orderId,
        supplierId,
        phone,
        error: errMsg,
        templateConfigured: contentSidConfigured,
      });
      await Order.updateOne(
        { _id: orderId },
        {
          $set: {
            [`foodMerchantAlerts.${supplierId}.phone`]: phone,
            [`foodMerchantAlerts.${supplierId}.error`]: errMsg.slice(0, 300),
            [`foodMerchantAlerts.${supplierId}.notifiedAt`]: new Date(),
            [`foodMerchantAlerts.${supplierId}.deliveryStatus`]: "undelivered",
          },
          $unset: {
            // Clear stale SID so retries are not skipped as "already sent".
            [`foodMerchantAlerts.${supplierId}.waSid`]: "",
          },
        }
      );

      // Last resort while Meta utility template is pending / outside 24h session:
      // branded SMS so the kitchen still learns about the paid order (WA remains primary).
      if (!prior?.smsSid) {
        try {
          const smsText = [
            `Qwertymates NEW ORDER ${orderNumber}`,
            `${storeName}`,
            itemSummary || "See Shop Orders",
            isCollection ? "Collection" : "Delivery",
            amount > 0 ? `Store total R${amount.toFixed(2)}` : null,
            "Open QwertyHub → Shop Orders.",
          ]
            .filter(Boolean)
            .join(" · ")
            .slice(0, 320);
          const smsDigits = canonicalPhoneDigits(phone) || "";
          if (zaSmsSenderMissingForDigits(smsDigits)) {
            logger.error(
              "Food/grocery SMS fallback likely undeliverable to ZA — set TWILIO_SMS_FROM_ZA (local +27 mobile). US TWILIO_SMS_FROM causes Twilio 30003",
              { orderId, supplierId, phone }
            );
          }
          const sms = await sendSms({ phone, text: smsText, channel: "sms" });
          await Order.updateOne(
            { _id: orderId },
            {
              $set: {
                [`foodMerchantAlerts.${supplierId}.smsSid`]: String(sms.sid || ""),
                [`foodMerchantAlerts.${supplierId}.provider`]: "sms_fallback",
                [`foodMerchantAlerts.${supplierId}.notifiedAt`]: new Date(),
                ...("from" in sms && sms.from
                  ? { [`foodMerchantAlerts.${supplierId}.smsFrom`]: String(sms.from) }
                  : {}),
              },
            }
          );
          logger.info("Food/grocery store SMS fallback sent after WhatsApp failure", {
            orderId,
            supplierId,
            phone,
            smsSid: sms.sid,
            smsFrom: "from" in sms ? sms.from || null : null,
            senderSource: "senderSource" in sms ? sms.senderSource || null : null,
          });
        } catch (smsErr) {
          logger.error("Food/grocery store SMS fallback ALSO failed", {
            orderId,
            supplierId,
            phone,
            error: String((smsErr as Error)?.message || smsErr),
            hint: zaSmsSenderMissingForDigits(canonicalPhoneDigits(phone) || "")
              ? "Buy/configure ZA Twilio mobile SMS number and set TWILIO_SMS_FROM_ZA — see DOCS/FOOD_MERCHANT_SMS_ZA_SENDER.md"
              : undefined,
          });
        }
      }
    }
  }
}
