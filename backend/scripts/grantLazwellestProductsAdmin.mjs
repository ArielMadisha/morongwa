#!/usr/bin/env node
/**
 * Grant lazwellest admin access to Load Products only (not full admin).
 *
 *   node scripts/grantLazwellestProductsAdmin.mjs --apply
 */
import "dotenv/config";
import mongoose from "mongoose";

const apply = process.argv.includes("--apply");
const USERNAME = "lazwellest";
/** Load Products catalog + uploads/import — no other admin sections. */
const SECTIONS = ["products", "product_uploads"];
/** GRANLUX GLOBAL supplier — products only for this store. */
const SCOPED_SUPPLIER_ID = "6a6ad6ce65a11c95d167524a";

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const users = db.collection("users");
  const perms = db.collection("adminpermissions");

  const user = await users.findOne({
    $or: [{ username: USERNAME }, { email: /lazwellest/i }, { phone: /8618640905065/ }],
  });
  if (!user) {
    console.error("User not found:", USERNAME);
    process.exit(1);
  }

  const superadmin = await users.findOne({ role: "superadmin" }, { projection: { _id: 1, username: 1 } });
  if (!superadmin) {
    console.error("No superadmin found for createdBy");
    process.exit(1);
  }

  const existingPerm = await perms.findOne({ userId: user._id });
  const roles = Array.isArray(user.role) ? [...user.role] : user.role ? [String(user.role)] : [];
  const normalized = roles
    .map((r) => (r === "user" ? "client" : r))
    .filter((r) => ["client", "runner", "admin", "superadmin"].includes(r));
  if (!normalized.includes("client") && !normalized.includes("runner")) normalized.unshift("client");
  const nextRoles = normalized.includes("admin")
    ? normalized.filter((r) => r !== "superadmin")
    : [...normalized.filter((r) => r !== "superadmin"), "admin"];

  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        userId: String(user._id),
        username: user.username,
        email: user.email,
        beforeRole: user.role,
        afterRole: nextRoles,
        beforeSections: existingPerm?.sections || null,
        afterSections: SECTIONS,
        scopedSupplierId: SCOPED_SUPPLIER_ID,
        adminUrl: "https://www.qwertymates.com/admin/products",
        note: "AdminPermission row required — bare admin would be full access. scopedSupplierId locks Load Products to GRANLUX only.",
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
  await users.updateOne({ _id: user._id }, { $set: { role: nextRoles, updatedAt: now } });

  await perms.updateOne(
    { userId: user._id },
    {
      $set: {
        userId: user._id,
        sections: SECTIONS,
        supportCategories: [],
        scopedSupplierId: new mongoose.Types.ObjectId(SCOPED_SUPPLIER_ID),
        createdBy: superadmin._id,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  const updatedUser = await users.findOne({ _id: user._id });
  const updatedPerm = await perms.findOne({ userId: user._id });
  console.log(
    JSON.stringify(
      {
        ok: true,
        username: updatedUser.username,
        role: updatedUser.role,
        sections: updatedPerm.sections,
        scopedSupplierId: String(updatedPerm.scopedSupplierId || ""),
        login: "lazwellest / Lazwellest@outlook.com / +86 186 4090 5065 — password 11111111",
        access: "Admin → Load Products for GRANLUX GLOBAL only",
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
