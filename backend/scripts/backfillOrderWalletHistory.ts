import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import Order from "../src/data/models/Order";
import Wallet from "../src/data/models/Wallet";
import { notifyBuyerOrderPurchase } from "../src/services/orderNotification";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function run() {
  const mongoUri = String(process.env.MONGO_URI || "").trim();
  if (!mongoUri) throw new Error("MONGO_URI missing");

  const orderId = String(process.argv[2] || "").trim();
  if (!orderId) throw new Error("Usage: npx ts-node-dev --transpile-only --exit-child scripts/backfillOrderWalletHistory.ts <orderId>");

  await mongoose.connect(mongoUri);
  try {
    const order = await Order.findById(orderId).lean();
    if (!order) throw new Error(`Order not found: ${orderId}`);

    const buyerId = String((order as any).buyerId || "").trim();
    if (!buyerId) throw new Error(`Order has no buyerId: ${orderId}`);
    const reference = `ORDER-${String((order as any)._id)}`;
    const amount = Number((order as any).amounts?.total ?? 0);

    let wallet = await Wallet.findOne({ user: buyerId });
    if (!wallet) wallet = await Wallet.create({ user: buyerId as any });
    const hasRef = (wallet.transactions || []).some(
      (t: any) => String(t?.reference || "").trim() === reference
    );
    if (!hasRef) {
      wallet.transactions.push({
        type: "debit",
        amount: -amount,
        reference,
        createdAt: (order as any).paidAt || (order as any).createdAt || new Date(),
      });
      await wallet.save();
      console.log(`Wallet history backfilled for ${reference}`);
    } else {
      console.log(`Wallet history already present for ${reference}`);
    }

    const items = ((order as any).items || []).map((it: any) => ({
      productId: String(it.productId),
      qty: Number(it.qty || 1),
    }));

    await notifyBuyerOrderPurchase({
      buyerId,
      orderId: String((order as any)._id),
      totalZar: amount,
      items,
    });
    console.log(`Buyer notifications + messenger backfill sent for ${reference}`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

