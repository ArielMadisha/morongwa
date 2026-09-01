#!/usr/bin/env node
/**
 * Merge WA cart from duplicate phone account (ona) onto ariel1069,
 * and unlink the phone from the nameless duplicate so WA resolves Ariel.
 *
 *   node scripts/fixAriel1069WaCartDuplicate.mjs --apply
 */
import "dotenv/config";
import mongoose from "mongoose";

const apply = process.argv.includes("--apply");
const PHONE = "27661294468";
const KEEP_USERNAME = "ariel1069";

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const users = db.collection("users");
  const carts = db.collection("carts");

  const keep = await users.findOne({ username: KEEP_USERNAME });
  const dupes = await users
    .find({ phone: PHONE, _id: { $ne: keep?._id } })
    .toArray();

  if (!keep) {
    console.error("Keep user not found:", KEEP_USERNAME);
    process.exit(1);
  }

  let keepCart = await carts.findOne({ user: keep._id });
  const report = {
    dryRun: !apply,
    keep: { id: String(keep._id), username: keep.username, phone: keep.phone },
    dupes: dupes.map((d) => ({
      id: String(d._id),
      name: d.name,
      username: d.username || null,
      email: d.email,
    })),
    mergedItems: [],
  };

  for (const d of dupes) {
    const dCart = await carts.findOne({ user: d._id });
    const items = Array.isArray(dCart?.items) ? dCart.items : [];
    report.mergedItems.push(
      ...items.map((i) => ({
        from: String(d._id),
        productId: String(i.productId),
        qty: i.qty,
      }))
    );

    if (!apply) continue;

    if (items.length) {
      if (!keepCart) {
        const ins = await carts.insertOne({
          user: keep._id,
          items: [],
          musicItems: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        keepCart = await carts.findOne({ _id: ins.insertedId });
      }
      const nextItems = [...(keepCart.items || [])];
      for (const item of items) {
        const pid = String(item.productId);
        const color = String(item.selectedColor || "").trim().toLowerCase();
        const existing = nextItems.find(
          (i) =>
            String(i.productId) === pid &&
            String(i.selectedColor || "").trim().toLowerCase() === color
        );
        if (existing) {
          existing.qty = Math.max(1, Number(existing.qty || 1) + Number(item.qty || 1));
        } else {
          nextItems.push(item);
        }
      }
      await carts.updateOne(
        { _id: keepCart._id },
        { $set: { items: nextItems, updatedAt: new Date() } }
      );
      keepCart = await carts.findOne({ _id: keepCart._id });
      await carts.updateOne(
        { _id: dCart._id },
        { $set: { items: [], updatedAt: new Date() } }
      );
    }

    // Free the phone so WA + login resolve to ariel1069 only.
    await users.updateOne(
      { _id: d._id },
      {
        $unset: { phone: "" },
        $set: {
          updatedAt: new Date(),
          note: `Phone ${PHONE} unlinked 2026-07-30 — duplicate of @${KEEP_USERNAME}`,
        },
      }
    );
  }

  const afterKeep = await carts.findOne({ user: keep._id });
  console.log(
    JSON.stringify(
      {
        ...report,
        afterCart: {
          items: (afterKeep?.items || []).map((i) => ({
            productId: String(i.productId),
            qty: i.qty,
            selectedColor: i.selectedColor,
          })),
        },
      },
      null,
      2
    )
  );

  if (!apply) console.log("Re-run with --apply");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
