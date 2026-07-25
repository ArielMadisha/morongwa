import mongoose from "mongoose";
import Product from "../data/models/Product";
import Supplier from "../data/models/Supplier";
import User from "../data/models/User";
import Order from "../data/models/Order";
import ProductEnquiry from "../data/models/ProductEnquiry";
import ProductEnquiryMessage from "../data/models/ProductEnquiryMessage";
import DirectMessage from "../data/models/DirectMessage";
import { withRegionalOrdersRecipient, parseEmailRecipientList } from "./emailRouting";
import {
  notifyPlatformAdminsRealtime,
  sendEmailWithAttachments,
  sendNotification,
} from "./notification";
import { pushMessengerSyncEvent } from "./messengerSyncBridge";
import { logger } from "./monitoring";
import { buildEftPaymentMessage } from "../config/eftBankDetails";
import { buildOrangeMoneyPaymentMessage } from "../config/orangeMoneyBw";
import { sendSms } from "./otpDelivery";
import { formatPhoneE164 } from "../utils/phoneE164";

/** Always merged in addition to ORDERS_INBOX_EMAIL (never replaces original primary). */
const DEFAULT_ORDERS_INBOX_ADDITIONAL = "orders@qwertymates.com";

/** Hard guarantee — every placed/paid marketplace order emails this inbox. */
const REQUIRED_ORDERS_INBOX = "orders@qwertymates.com";

/** Default staff WhatsApp for new-order alerts (SA mobile). Override with ORDERS_OPS_WHATSAPP. */
const DEFAULT_ORDERS_OPS_WHATSAPP = "+27660442139";
/** First configured primary inbox (legacy / original). May be empty if only additional inboxes are used. */
export function resolveOrdersInboxEmail(): string {
  const primary = parseEmailRecipientList(process.env.ORDERS_INBOX_EMAIL);
  if (primary.length) return primary[0];
  const additional = parseEmailRecipientList(
    process.env.ORDERS_INBOX_CC || DEFAULT_ORDERS_INBOX_ADDITIONAL
  );
  return additional[0] || DEFAULT_ORDERS_INBOX_ADDITIONAL;
}

/**
 * Order alert email recipients — all ADDITIONAL to existing in-app / Messenger / seller flows.
 * - ORDERS_INBOX_EMAIL: original primary inbox(es), unchanged when set on the server
 * - ORDERS_INBOX_CC: always merged in (defaults to orders@qwertymates.com)
 * - orders@qwertymates.com is always included even if env is misconfigured
 * - Regional BW/ZM inboxes merged when delivery country matches
 */
export function resolveOrdersInboxRecipients(deliveryCountryCode?: string): string[] {
  const primary = parseEmailRecipientList(process.env.ORDERS_INBOX_EMAIL);
  const additional = parseEmailRecipientList(
    process.env.ORDERS_INBOX_CC || DEFAULT_ORDERS_INBOX_ADDITIONAL
  );
  const merged = [...primary, ...additional, REQUIRED_ORDERS_INBOX];
  const base = [
    ...new Set(
      (merged.length ? merged : [REQUIRED_ORDERS_INBOX]).map((e) => e.toLowerCase())
    ),
  ];
  return withRegionalOrdersRecipient(base, deliveryCountryCode);
}

/**
 * Staff WhatsApp numbers for new-order alerts.
 * ORDERS_OPS_WHATSAPP — comma-separated; defaults to +27660442139.
 * Set ORDERS_OPS_WHATSAPP= (empty) to disable WhatsApp order alerts.
 */
export function resolveOrdersOpsWhatsAppPhones(): string[] {
  if (!Object.prototype.hasOwnProperty.call(process.env, "ORDERS_OPS_WHATSAPP")) {
    const one = formatPhoneE164(DEFAULT_ORDERS_OPS_WHATSAPP);
    return one ? [one] : [];
  }
  const raw = String(process.env.ORDERS_OPS_WHATSAPP || "").trim();
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,;]+/)) {
    const e164 = formatPhoneE164(part.trim());
    if (!e164 || seen.has(e164)) continue;
    seen.add(e164);
    out.push(e164);
  }
  return out;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type OrderItemInput = {
  productId: string;
  qty: number;
};

export function formatOrderNumber(orderId: string): string {
  const id = String(orderId || "").trim();
  if (!id) return "ORDER-unknown";
  if (id.toUpperCase().startsWith("ORDER-")) return id;
  return `ORDER-${id}`;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function resolveOrderMessengerSenderId(): Promise<string | null> {
  const username = String(process.env.ORDER_MESSENGER_SENDER_USERNAME || "qwertymates").trim().toLowerCase();
  if (username) {
    const u = await User.findOne({ username }).select("_id").lean();
    if (u?._id) return String(u._id);
  }
  const admin = await User.findOne({ role: { $in: ["superadmin", "admin"] } }).select("_id").lean();
  return admin?._id ? String(admin._id) : null;
}

async function enquiryAlreadyHasOrderMessage(
  enquiryId: mongoose.Types.ObjectId,
  orderNumber: string
): Promise<boolean> {
  const token = escapeRegex(orderNumber);
  const hit = await ProductEnquiryMessage.findOne({
    enquiryId,
    content: { $regex: token, $options: "i" },
  })
    .select("_id")
    .lean();
  return !!hit;
}

async function postProductEnquiryOrderMessage(options: {
  enquiryId: mongoose.Types.ObjectId;
  senderId: string;
  content: string;
  orderNumber: string;
}): Promise<boolean> {
  if (await enquiryAlreadyHasOrderMessage(options.enquiryId, options.orderNumber)) {
    return false;
  }
  await ProductEnquiryMessage.create({
    enquiryId: options.enquiryId,
    senderId: options.senderId,
    content: options.content,
    read: false,
  });
  await ProductEnquiry.updateOne({ _id: options.enquiryId }, { lastMessageAt: new Date() });
  return true;
}

/** Buyer receipt + seller alert in Messages → Product enquiries tab. */
export async function postBuyerOrderReceiptInMessenger(options: {
  buyerId: string;
  orderId: string;
  totalZar: number;
  items?: OrderItemInput[];
}): Promise<{ enquiryMessages: number; directMessage: boolean }> {
  const { buyerId, orderId, totalZar, items = [] } = options;
  const orderNumber = formatOrderNumber(orderId);
  const amountLine = `Amount: R${Number(totalZar || 0).toFixed(2)}.`;
  const buyerReceipt = `ORDER NUMBER ${orderNumber} SUCCESSFUL. ${amountLine}`;
  let enquiryMessages = 0;

  const seenEnquiries = new Set<string>();

  for (const item of items) {
    const product = await Product.findById(item.productId).select("title supplierId").lean();
    if (!product) continue;

    const supplier = await Supplier.findById((product as any).supplierId).select("userId storeName").lean();
    const sellerId = (supplier as any)?.userId?.toString?.();
    if (!sellerId) continue;

    const enquiry = await ProductEnquiry.findOneAndUpdate(
      { productId: product._id, buyerId, sellerId },
      {
        $setOnInsert: { productId: product._id, buyerId, sellerId },
        $set: { lastMessageAt: new Date() },
      },
      { upsert: true, new: true }
    );

    const enquiryKey = String(enquiry._id);
    if (seenEnquiries.has(enquiryKey)) continue;
    seenEnquiries.add(enquiryKey);

    const detail = `${buyerReceipt} Item: ${item.qty} x ${(product as any).title || "product"}.`;
    const posted = await postProductEnquiryOrderMessage({
      enquiryId: enquiry._id as mongoose.Types.ObjectId,
      senderId: sellerId,
      content: detail,
      orderNumber,
    });
    if (posted) enquiryMessages += 1;
  }

  const platformSenderId = await resolveOrderMessengerSenderId();
  let directMessage = false;
  if (platformSenderId && platformSenderId !== buyerId) {
    const token = escapeRegex(orderNumber);
    const existingDm = await DirectMessage.findOne({
      $or: [
        { sender: platformSenderId, receiver: buyerId },
        { sender: buyerId, receiver: platformSenderId },
      ],
      content: { $regex: token, $options: "i" },
    })
      .select("_id")
      .lean();

    if (!existingDm) {
      const itemLines =
        items.length > 0 ? ` ${items.length} product line(s) in this order.` : "";
      const dm = await DirectMessage.create({
        sender: platformSenderId,
        receiver: buyerId,
        content: `${buyerReceipt}${itemLines}`.slice(0, 1000),
        read: false,
      });
      directMessage = true;
      pushMessengerSyncEvent("message.created", platformSenderId, {
        conversationType: "direct",
        conversationId: `direct-${platformSenderId}`,
        messageId: dm._id.toString(),
        senderUserId: platformSenderId,
        receiverUserId: buyerId,
        body: dm.content,
        createdAt: dm.createdAt.toISOString(),
      });
    }
  }

  return { enquiryMessages, directMessage };
}

/** Email orders inbox(es) when a marketplace order is placed or paid (additive SMTP; does not replace in-app/Messenger). */
export async function sendOrderPlacedEmailToOrdersInbox(orderId: string): Promise<void> {
  try {
    const order = await Order.findById(orderId)
      .populate("buyerId", "name email phone username")
      .populate("items.productId", "title")
      .lean();
    if (!order) return;

    const paymentMethod = String((order as { paymentMethod?: string }).paymentMethod || "")
      .trim()
      .toLowerCase();
    const status = String(order.status || "").trim().toLowerCase();
    // Online methods (card / wallet): never email while still pending — only after paid.
    if (
      (paymentMethod === "card" || paymentMethod === "wallet") &&
      status !== "paid" &&
      status !== "fulfilled" &&
      status !== "shipped" &&
      status !== "completed"
    ) {
      logger.info("Orders inbox email skipped until payment succeeds", {
        orderId,
        paymentMethod,
        status,
      });
      return;
    }

    const buyer = order.buyerId as { name?: string; email?: string; phone?: string; username?: string } | null;
    const orderNumber = formatOrderNumber(orderId);
    const statusLabel = String(order.status || "unknown").replace(/_/g, " ");
    const amounts = order.amounts || ({} as { total?: number; shipping?: number; subtotal?: number });
    const delivery = order.delivery || ({} as { address?: string; serviceLabel?: string; countryCode?: string });
    const adminOrdersUrl = `${process.env.FRONTEND_URL || "https://www.qwertymates.com"}/admin/orders`;

    const itemLines = (order.items || []).map((it) => {
      const product = it.productId as { title?: string } | null;
      const title = product?.title || "Product";
      return `- ${it.qty} x ${title} @ R${Number(it.price || 0).toFixed(2)}`;
    });

    const text = [
      `Order: ${orderNumber}`,
      `Status: ${statusLabel}`,
      `Payment method: ${order.paymentMethod || "—"}`,
      `Buyer: ${buyer?.name || "—"} (${buyer?.email || "—"})`,
      buyer?.phone ? `Contact: ${buyer.phone}` : null,
      buyer?.username ? `Username: @${buyer.username}` : null,
      `Subtotal: R${Number(amounts.subtotal || 0).toFixed(2)}`,
      `Shipping: R${Number(amounts.shipping || 0).toFixed(2)}`,
      `Total: R${Number(amounts.total || 0).toFixed(2)}`,
      delivery.address ? `Delivery address: ${delivery.address}` : null,
      delivery.countryCode ? `Country: ${delivery.countryCode}` : null,
      delivery.serviceLabel ? `Courier: ${delivery.serviceLabel}` : null,
      "",
      "Items:",
      itemLines.length ? itemLines.join("\n") : "—",
      "",
      `View in admin: ${adminOrdersUrl}`,
    ]
      .filter(Boolean)
      .join("\n");

    const html = `
      <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a">
        <h2 style="margin:0 0 12px">New marketplace order — ${escapeHtml(orderNumber)}</h2>
        <p><strong>Status:</strong> ${escapeHtml(statusLabel)}</p>
        <p><strong>Payment:</strong> ${escapeHtml(String(order.paymentMethod || "—"))}</p>
        <p><strong>Buyer:</strong> ${escapeHtml(buyer?.name || "—")} &lt;${escapeHtml(buyer?.email || "—")}&gt;</p>
        ${buyer?.phone ? `<p><strong>Contact:</strong> ${escapeHtml(buyer.phone)}</p>` : ""}
        <p><strong>Total:</strong> R${Number(amounts.total || 0).toFixed(2)} (shipping R${Number(amounts.shipping || 0).toFixed(2)})</p>
        ${delivery.address ? `<p><strong>Address:</strong> ${escapeHtml(delivery.address)}</p>` : ""}
        ${delivery.serviceLabel ? `<p><strong>Courier:</strong> ${escapeHtml(delivery.serviceLabel)}</p>` : ""}
        <h3 style="margin:16px 0 8px">Items</h3>
        <ul>${itemLines.map((line) => `<li>${escapeHtml(line.replace(/^- /, ""))}</li>`).join("") || "<li>—</li>"}</ul>
        <p style="margin-top:16px"><a href="${escapeHtml(adminOrdersUrl)}">Open admin orders</a></p>
      </div>
    `;

    const recipients = resolveOrdersInboxRecipients(delivery.countryCode);
    const sent = await sendEmailWithAttachments({
      to: recipients,
      subject: `New order placed ${orderNumber} (${statusLabel})`,
      text,
      html,
    });
    if (sent) {
      logger.info("Orders inbox email sent", { orderId, orderNumber, recipients });
    } else {
      logger.warn("Orders inbox email was not sent (SMTP unavailable or misconfigured)", {
        orderId,
        orderNumber,
        recipients,
      });
    }

    // Same place/paid gating as email — notify staff WhatsApp with order details.
    const waPhones = resolveOrdersOpsWhatsAppPhones();
    if (waPhones.length) {
      const waText = text.slice(0, 1500);
      for (const phone of waPhones) {
        try {
          const wa = await sendSms({ phone, text: waText, channel: "whatsapp" });
          logger.info("Orders ops WhatsApp sent", {
            orderId,
            orderNumber,
            phone,
            sid: wa.sid,
            provider: wa.provider,
          });
        } catch (waErr) {
          logger.warn("Orders ops WhatsApp failed (non-fatal)", {
            orderId,
            orderNumber,
            phone,
            error: String((waErr as Error)?.message || waErr),
          });
        }
      }
    }
  } catch (error) {
    logger.warn("sendOrderPlacedEmailToOrdersInbox failed (non-fatal)", {
      orderId,
      error: String((error as Error)?.message || error),
    });
  }
}

export async function notifyOrderPaid(options: {
  orderId: string;
  buyerId: string;
  items: OrderItemInput[];
}) {
  const { orderId, buyerId, items } = options;
  if (!items.length) return;

  const buyer = await User.findById(buyerId).select("name email").lean();
  if (!buyer) return;
  const orderNumber = formatOrderNumber(orderId);

  for (const item of items) {
    const product = await Product.findById(item.productId)
      .select("title supplierId")
      .lean();
    if (!product) continue;

    const supplier = await Supplier.findById((product as any).supplierId)
      .select("userId storeName")
      .lean();
    const sellerId = (supplier as any)?.userId?.toString?.();
    if (!sellerId) continue;

    const enquiry = await ProductEnquiry.findOneAndUpdate(
      { productId: product._id, buyerId, sellerId },
      {
        $setOnInsert: {
          productId: product._id,
          buyerId,
          sellerId,
        },
        $set: { lastMessageAt: new Date() },
      },
      { upsert: true, new: true }
    );

    const lineMessage = `${orderNumber}: ${(buyer as any).name || "Buyer"} bought ${item.qty} x ${(product as any).title || "product"}.`;
    await postProductEnquiryOrderMessage({
      enquiryId: enquiry._id as mongoose.Types.ObjectId,
      senderId: buyerId,
      content: lineMessage,
      orderNumber,
    });

    const seller = await User.findById(sellerId)
      .select("notificationPreferences")
      .lean();
    const prefs = (seller as any)?.notificationPreferences || {};

    const shouldMessenger = prefs.orderMessenger !== false;
    const shouldEmail = prefs.orderEmail !== false;
    const shouldSms = prefs.orderSms === true;
    const shouldWhatsapp = prefs.orderWhatsapp === true;

    if (shouldMessenger) {
      await sendNotification({
        userId: sellerId,
        type: "order_purchase",
        message: lineMessage,
        channel: "realtime",
      });
    }

    if (shouldEmail) {
      await sendNotification({
        userId: sellerId,
        type: "order_purchase_email",
        message: lineMessage,
        channel: "email",
        email: {
          subject: `New order received (${orderNumber})`,
          html: `<p>${lineMessage}</p>`,
        },
      });
    }

    if (shouldSms) {
      await sendNotification({
        userId: sellerId,
        type: "order_purchase_sms",
        message: lineMessage,
        channel: "sms",
      });
    }

    if (shouldWhatsapp) {
      await sendNotification({
        userId: sellerId,
        type: "order_purchase_whatsapp",
        message: lineMessage,
        channel: "whatsapp",
      });
    }
  }
}

/** Remind buyer that delivery was paid with the order — ops must not collect courier fees separately. */
export async function notifyBuyerDeliveryPrepaid(options: {
  buyerId: string;
  orderId: string;
  shippingZar: number;
}) {
  const { buyerId, orderId, shippingZar } = options;
  if (!(shippingZar > 0)) return;
  const orderNumber = formatOrderNumber(orderId);
  await sendNotification({
    userId: buyerId,
    type: "order_delivery_prepaid",
    message: `${orderNumber}: delivery (R${shippingZar.toFixed(2)}) was included in your checkout payment. You do not need to pay the courier separately.`,
    channel: "realtime",
  });
}

/** Buyer receipt: bell notification + Messages (direct + product enquiries). */
export async function notifyBuyerOrderPurchase(options: {
  buyerId: string;
  orderId: string;
  totalZar: number;
  items?: OrderItemInput[];
}) {
  const { buyerId, orderId, totalZar, items = [] } = options;
  const orderNumber = formatOrderNumber(orderId);
  const message = `ORDER NUMBER ${orderNumber} SUCCESSFUL. Amount: R${Number(totalZar || 0).toFixed(2)}.`;

  await sendNotification({
    userId: buyerId,
    type: "order_purchase_buyer",
    message,
    channel: "realtime",
  });

  await postBuyerOrderReceiptInMessenger({
    buyerId,
    orderId,
    totalZar,
    items,
  });

  await notifyPlatformAdminsRealtime({
    type: "order_purchase_admin",
    message: `New product purchase: ${orderNumber} paid (R${Number(totalZar || 0).toFixed(2)}).`,
  });

  // Additional admin email (orders@ + ORDERS_INBOX_EMAIL + regional); original flows above unchanged.
  await sendOrderPlacedEmailToOrdersInbox(orderId);
}

/** Send EFT bank details + payment reference to buyer Messenger (direct message from platform). */
export async function sendEftPaymentInstructionsInMessenger(options: {
  buyerId: string;
  orderId: string;
  amount: number;
  currency: string;
  country: "ZA" | "BW";
  reference: string;
}): Promise<boolean> {
  const { buyerId, orderId, amount, currency, country, reference } = options;
  const orderNumber = formatOrderNumber(orderId);
  const content = buildEftPaymentMessage({ orderNumber, amount, currency, reference, country });

  return sendPlatformPaymentInstructionsDm({
    buyerId,
    orderId,
    reference,
    content,
    notificationType: "eft_payment_instructions",
    notificationMessage: `EFT instructions for ${orderNumber} — check Messenger.`,
  });
}

async function sendPlatformPaymentInstructionsDm(options: {
  buyerId: string;
  orderId: string;
  reference: string;
  content: string;
  notificationType: string;
  notificationMessage: string;
}): Promise<boolean> {
  const { buyerId, orderId, reference, content, notificationType, notificationMessage } = options;
  const platformSenderId = await resolveOrderMessengerSenderId();
  if (!platformSenderId || platformSenderId === buyerId) {
    logger.warn("Payment messenger instructions skipped — no platform sender", { orderId, buyerId });
    return false;
  }

  const token = escapeRegex(reference);
  const existingDm = await DirectMessage.findOne({
    $or: [
      { sender: platformSenderId, receiver: buyerId },
      { sender: buyerId, receiver: platformSenderId },
    ],
    content: { $regex: token, $options: "i" },
  })
    .select("_id")
    .lean();

  if (existingDm) return false;

  const dm = await DirectMessage.create({
    sender: platformSenderId,
    receiver: buyerId,
    content: content.slice(0, 2000),
    read: false,
  });

  pushMessengerSyncEvent("message.created", platformSenderId, {
    conversationType: "direct",
    conversationId: `direct-${platformSenderId}`,
    messageId: dm._id.toString(),
    senderUserId: platformSenderId,
    receiverUserId: buyerId,
    body: dm.content,
    createdAt: dm.createdAt.toISOString(),
  });

  await sendNotification({
    userId: buyerId,
    type: notificationType,
    message: notificationMessage,
    channel: "realtime",
  });

  return true;
}

/** Send Orange Money number + payment reference to buyer Messenger (Botswana). */
export async function sendOrangeMoneyPaymentInstructionsInMessenger(options: {
  buyerId: string;
  orderId: string;
  total: number;
  currency: string;
  reference: string;
}): Promise<boolean> {
  const { buyerId, orderId, total, currency, reference } = options;
  const orderNumber = formatOrderNumber(orderId);
  const content = buildOrangeMoneyPaymentMessage({
    orderNumber,
    amount: total,
    currency,
    reference,
  });

  return sendPlatformPaymentInstructionsDm({
    buyerId,
    orderId,
    reference,
    content,
    notificationType: "orange_money_payment_instructions",
    notificationMessage: `Orange Money instructions for ${orderNumber} — check Messenger.`,
  });
}
