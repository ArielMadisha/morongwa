import Product from "../data/models/Product";
import Supplier from "../data/models/Supplier";
import User from "../data/models/User";
import ProductEnquiry from "../data/models/ProductEnquiry";
import ProductEnquiryMessage from "../data/models/ProductEnquiryMessage";
import { sendNotification } from "./notification";

type OrderItemInput = {
  productId: string;
  qty: number;
};

export async function notifyOrderPaid(options: {
  orderId: string;
  buyerId: string;
  items: OrderItemInput[];
}) {
  const { orderId, buyerId, items } = options;
  if (!items.length) return;

  const buyer = await User.findById(buyerId).select("name email").lean();
  if (!buyer) return;

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

    const lineMessage = `Order #${orderId}: ${(buyer as any).name || "Buyer"} bought ${item.qty} x ${(product as any).title || "product"}.`;
    await ProductEnquiryMessage.create({
      enquiryId: enquiry._id,
      senderId: buyerId,
      content: lineMessage,
      read: false,
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
          subject: `New order received (#${orderId})`,
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
