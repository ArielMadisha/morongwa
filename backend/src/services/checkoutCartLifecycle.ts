import Cart from "../data/models/Cart";
import Order from "../data/models/Order";
import type { IOrder } from "../data/models/Order";

/** Clear cart only after payment is confirmed (wallet or card webhook). */
export async function clearBuyerCartAfterOrderPaid(buyerId: string): Promise<void> {
  const cart = await Cart.findOne({ user: buyerId });
  if (!cart) return;
  cart.items = [];
  cart.musicItems = [];
  await cart.save();
}

/** Merge order lines back into the buyer cart (e.g. card payment cancelled). */
export async function restoreCartLinesFromOrder(order: IOrder): Promise<void> {
  const buyerId = order.buyerId;
  let cart = await Cart.findOne({ user: buyerId });
  if (!cart) {
    cart = await Cart.create({ user: buyerId, items: [], musicItems: [] });
  }

  for (const line of order.items || []) {
    const productId = line.productId;
    const pid = productId.toString();
    const existing = cart.items.find((i) => (i.productId as { toString(): string }).toString() === pid);
    if (existing) {
      existing.qty = Math.max(existing.qty, line.qty);
    } else {
      cart.items.push({
        productId,
        qty: line.qty,
        ...(line.resellerId ? { resellerId: line.resellerId } : {}),
      });
    }
  }

  for (const line of order.musicItems || []) {
    const songId = line.songId;
    const sid = songId.toString();
    const existing = cart.musicItems?.find((i) => (i.songId as { toString(): string }).toString() === sid);
    if (existing) {
      existing.qty = Math.max(existing.qty, line.qty);
    } else {
      if (!cart.musicItems) cart.musicItems = [];
      cart.musicItems.push({ songId, qty: line.qty });
    }
  }

  await cart.save();
}

export async function cancelPendingOrderIfUnpaid(orderId: string): Promise<IOrder | null> {
  const order = await Order.findById(orderId);
  if (!order || order.status !== "pending_payment") return order;
  order.status = "cancelled";
  await order.save();
  return order;
}

/** Drop abandoned card checkouts so a new pay attempt does not stack pending orders. */
export async function cancelOtherPendingOrdersForBuyer(
  buyerId: string,
  keepOrderId?: string
): Promise<void> {
  const filter: Record<string, unknown> = {
    buyerId,
    status: "pending_payment",
    paymentMethod: "card",
  };
  if (keepOrderId) filter._id = { $ne: keepOrderId };
  await Order.updateMany(filter, { status: "cancelled" });
}
