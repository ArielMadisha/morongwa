#!/usr/bin/env node
/**
 * Move QwertyHub Test Shop from African History → Ariel Madisha (same phone 27720570259).
 *   node scripts/moveTestShopToArielMadisha.mjs
 */
import "dotenv/config";
import mongoose from "mongoose";

const STORE_ID = "6a6264d138377d1da374bcab";
const SUPPLIER_ID = "6a6264d138377d1da374bcac";
const ARIEL_ID = "69d4bd1642ec816dcc09e708";
const PHONE = "27720570259";

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const now = new Date();
const storeId = new mongoose.Types.ObjectId(STORE_ID);
const supplierId = new mongoose.Types.ObjectId(SUPPLIER_ID);
const arielId = new mongoose.Types.ObjectId(ARIEL_ID);

const ariel = await db.collection("users").findOne({ _id: arielId });
if (!ariel) {
  console.error("Ariel Madisha not found");
  process.exit(1);
}

await db.collection("users").updateOne(
  { _id: arielId },
  {
    $set: {
      phone: PHONE,
      "notificationPreferences.orderMessenger": true,
      "notificationPreferences.orderEmail": true,
      "notificationPreferences.orderSms": true,
      "notificationPreferences.orderWhatsapp": true,
      updatedAt: now,
    },
  }
);

await db.collection("stores").updateOne(
  { _id: storeId },
  {
    $set: {
      userId: arielId,
      cellphone: PHONE,
      whatsapp: `+${PHONE}`,
      email: ariel.email || "",
      updatedAt: now,
    },
  }
);

await db.collection("suppliers").updateOne(
  { _id: supplierId },
  {
    $set: {
      userId: arielId,
      contactPhone: PHONE,
      updatedAt: now,
    },
  }
);

const store = await db.collection("stores").findOne({ _id: storeId }, { projection: { name: 1, userId: 1 } });
const supplier = await db
  .collection("suppliers")
  .findOne({ _id: supplierId }, { projection: { storeName: 1, userId: 1, contactPhone: 1 } });
const products = await db
  .collection("products")
  .find({ supplierId, active: true })
  .project({ title: 1, price: 1 })
  .toArray();

console.log(
  JSON.stringify(
    {
      owner: { id: String(ariel._id), name: ariel.name, username: ariel.username, phone: PHONE },
      store,
      supplier,
      products,
    },
    null,
    2
  )
);

await mongoose.disconnect();
