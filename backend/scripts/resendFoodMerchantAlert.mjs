#!/usr/bin/env node
/**
 * Re-run food/grocery merchant settlement for a paid order (wallet credit idempotent; SMS+WA alert).
 * Usage: node scripts/resendFoodMerchantAlert.mjs <orderId>
 */
import "dotenv/config";
import { createRequire } from "module";
import mongoose from "mongoose";

const require = createRequire(import.meta.url);
const { settleFoodPickupOrderPaid } = require("../dist/src/services/foodOrderSettlement.js");

const orderId = String(process.argv[2] || "").trim();
if (!orderId) {
  console.error("Usage: node scripts/resendFoodMerchantAlert.mjs <orderId>");
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);
// Clear prior alert markers so SMS is re-sent (repair path).
await mongoose.connection.db.collection("orders").updateOne(
  { _id: new mongoose.Types.ObjectId(orderId) },
  { $unset: { foodMerchantAlerts: "" } }
);
await settleFoodPickupOrderPaid(orderId);
const order = await mongoose.connection.db.collection("orders").findOne(
  { _id: new mongoose.Types.ObjectId(orderId) },
  { projection: { foodMerchantAlerts: 1, status: 1 } }
);
console.log(JSON.stringify(order, null, 2));
await mongoose.disconnect();
