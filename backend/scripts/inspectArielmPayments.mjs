#!/usr/bin/env node
import "dotenv/config";
import mongoose from "mongoose";

const ids = [
  new mongoose.Types.ObjectId("69d4c475574fc61dbbeee390"), // arielm
  new mongoose.Types.ObjectId("69d4bd1642ec816dcc09e708"), // arielmadisha
];
const from = new Date("2026-07-23T22:00:00.000Z"); // ~00:00 SAST Jul 24
const to = new Date("2026-07-24T04:00:00.000Z"); // ~06:00 SAST Jul 24

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;

const orders = await db
  .collection("orders")
  .find({ buyerId: { $in: ids }, createdAt: { $gte: from, $lte: to } })
  .sort({ createdAt: -1 })
  .toArray();

console.log("ORDERS", orders.length);
for (const o of orders) {
  console.log(
    JSON.stringify(
      {
        id: String(o._id),
        buyerId: String(o.buyerId),
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        paymentReference: o.paymentReference,
        total: o.amounts?.total,
        currency: o.amounts?.currency,
        shipping: o.amounts?.shipping,
        items: (o.items || []).map((i) => ({
          productId: String(i.productId),
          qty: i.qty,
          price: i.price,
          color: i.selectedColor,
          size: i.selectedSize,
        })),
        delivery: o.delivery,
        createdAt: o.createdAt,
        paidAt: o.paidAt,
        updatedAt: o.updatedAt,
      },
      null,
      2
    )
  );
}

const orderIds = orders.map((o) => o._id);
const payments = await db
  .collection("payments")
  .find({
    $or: [
      { userId: { $in: ids } },
      { buyerId: { $in: ids } },
      { user: { $in: ids } },
      ...(orderIds.length ? [{ orderId: { $in: orderIds } }] : []),
    ],
    createdAt: { $gte: from, $lte: to },
  })
  .sort({ createdAt: -1 })
  .toArray();

console.log("PAYMENTS", payments.length);
for (const p of payments) {
  console.log(
    JSON.stringify(
      {
        id: String(p._id),
        orderId: p.orderId ? String(p.orderId) : null,
        userId: p.userId
          ? String(p.userId)
          : p.buyerId
            ? String(p.buyerId)
            : p.user
              ? String(p.user)
              : null,
        status: p.status,
        amount: p.amount,
        currency: p.currency,
        method: p.method || p.paymentMethod,
        reference: p.reference || p.paygateReference || p.transactionId,
        keys: Object.keys(p),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      },
      null,
      2
    )
  );
}

// Also pull any recent orders for arielm regardless of window (last 10)
const recent = await db
  .collection("orders")
  .find({ buyerId: ids[0] })
  .sort({ createdAt: -1 })
  .limit(10)
  .toArray();
console.log("RECENT_ARIELM", recent.length);
for (const o of recent) {
  console.log(
    JSON.stringify(
      {
        id: String(o._id),
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        total: o.amounts?.total,
        createdAt: o.createdAt,
        paidAt: o.paidAt,
      },
      null,
      2
    )
  );
}

await mongoose.disconnect();
