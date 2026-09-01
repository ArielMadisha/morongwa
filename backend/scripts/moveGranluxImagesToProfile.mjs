#!/usr/bin/env node
/**
 * GRANLUX: remove priced catalog products; put product photos on Laz Wellest profile gallery only.
 * Owner will send real products with prices later.
 *
 *   node scripts/moveGranluxImagesToProfile.mjs --apply
 */
import "dotenv/config";
import mongoose from "mongoose";

const apply = process.argv.includes("--apply");
const USERNAME = "lazwellest";
const STORE_NAME = "GRANLUX GLOBAL";

const GALLERY = [
  "/uploads/granlux-vessel-basins.jpg",
  "/uploads/granlux-freestanding-bathtub.jpg",
  "/uploads/granlux-catalog-pamphlet.jpg",
  "/uploads/granlux-worldwide-shipping.jpg",
];

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const users = db.collection("users");
  const products = db.collection("products");
  const suppliers = db.collection("suppliers");

  const user = await users.findOne({
    $or: [{ username: USERNAME }, { email: /lazwellest/i }, { phone: /8618640905065/ }],
  });
  if (!user) {
    console.error("User not found");
    process.exit(1);
  }

  const supplier = await suppliers.findOne({
    $or: [{ userId: user._id, storeName: /granlux/i }, { storeName: STORE_NAME }],
  });
  const supplierId = supplier?._id;
  const priced = supplierId
    ? await products
        .find({ supplierId })
        .project({ title: 1, price: 1, active: 1, sku: 1, images: 1 })
        .toArray()
    : [];

  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        userId: String(user._id),
        username: user.username,
        profileUrl: `https://www.qwertymates.com/user/${user._id}`,
        beforeGallery: user.profileGalleryUrls || [],
        afterGallery: GALLERY,
        productsToDeactivate: priced.map((p) => ({
          id: String(p._id),
          title: p.title,
          price: p.price,
          active: p.active,
        })),
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("Re-run with --apply");
    await mongoose.disconnect();
    return;
  }

  const now = new Date();
  if (supplierId) {
    const r = await products.updateMany(
      { supplierId },
      { $set: { active: false, updatedAt: now } }
    );
    console.log("deactivated products", r.modifiedCount);
  }

  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        profileGalleryUrls: GALLERY,
        avatar: GALLERY[2], // pamphlet as profile photo
        updatedAt: now,
      },
    }
  );

  const updated = await users.findOne({ _id: user._id });
  const stillActive = supplierId
    ? await products.countDocuments({ supplierId, active: true })
    : 0;
  console.log(
    JSON.stringify(
      {
        ok: true,
        profileGalleryUrls: updated.profileGalleryUrls,
        avatar: updated.avatar,
        activeStoreProducts: stillActive,
        note: "Store GRANLUX GLOBAL kept; catalog empty until owner sends priced products.",
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
