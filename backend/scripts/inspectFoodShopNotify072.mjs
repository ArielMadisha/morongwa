#!/usr/bin/env node
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;

const users = await db
  .collection("users")
  .find({ phone: { $regex: "720570259" } })
  .project({ username: 1, name: 1, phone: 1 })
  .toArray();
console.log("USERS", JSON.stringify(users, null, 2));

const userIds = users.map((u) => u._id);
const suppliers = await db.collection("suppliers").find({ userId: { $in: userIds } }).toArray();
for (const s of suppliers) {
  const notifyKeys = Object.keys(s).filter((k) =>
    /phone|whats|notif|sms|order|food|alert/i.test(k)
  );
  console.log(
    JSON.stringify(
      {
        supplierId: String(s._id),
        storeName: s.storeName,
        userId: String(s.userId),
        notifyKeys,
        phone: s.phone,
        whatsappOrderAlerts: s.whatsappOrderAlerts,
        smsOrderAlerts: s.smsOrderAlerts,
        orderAlertPhone: s.orderAlertPhone,
      },
      null,
      2
    )
  );
}

const stores = await db
  .collection("stores")
  .find({
    $or: [{ userId: { $in: userIds } }, { supplierId: { $in: suppliers.map((s) => s._id) } }],
  })
  .toArray();
for (const s of stores) {
  console.log(
    JSON.stringify(
      {
        storeId: String(s._id),
        name: s.name,
        slug: s.slug,
        type: s.type,
        userId: s.userId ? String(s.userId) : null,
        supplierId: s.supplierId ? String(s.supplierId) : null,
        whatsapp: s.whatsapp,
        cellphone: s.cellphone,
        phone: s.phone,
      },
      null,
      2
    )
  );
}

const paidOrderId = new mongoose.Types.ObjectId("6a62b3eefa002e570555e117");
const order = await db.collection("orders").findOne({ _id: paidOrderId });
console.log(
  "PAID_ORDER",
  JSON.stringify(
    {
      id: String(order._id),
      status: order.status,
      items: order.items,
      amounts: order.amounts,
    },
    null,
    2
  )
);

const productIds = (order.items || []).map((i) => i.productId);
const products = await db
  .collection("products")
  .find({ _id: { $in: productIds } })
  .project({ title: 1, supplierId: 1, categories: 1, tags: 1 })
  .toArray();
console.log("PRODUCTS", JSON.stringify(products, null, 2));

await mongoose.disconnect();
