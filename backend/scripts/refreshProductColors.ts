/**
 * Re-detect garment colors for one or all products (ignores studio backgrounds).
 *
 * Usage (from backend/):
 *   npx ts-node scripts/refreshProductColors.ts --id=6a36180619dc8ed2cf45ccb5
 *   npx ts-node scripts/refreshProductColors.ts --all --limit=50
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Product from "../src/data/models/Product";
import { assignProductColors } from "../src/services/assignProductColors";

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI required");

  const idArg = process.argv.find((a) => a.startsWith("--id="))?.split("=")[1]?.trim();
  const all = process.argv.includes("--all");
  const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || "100");

  await mongoose.connect(uri);

  if (idArg) {
    const colors = await assignProductColors(idArg, { force: true });
    const p = await Product.findById(idArg).select("title colors").lean();
    console.log(JSON.stringify({ id: idArg, title: (p as any)?.title, colors }, null, 2));
    await mongoose.disconnect();
    return;
  }

  if (!all) {
    console.error("Pass --id=<productId> or --all");
    process.exit(1);
  }

  const rows = await Product.find({ images: { $exists: true, $ne: [] } })
    .select("_id title")
    .limit(limit)
    .lean();

  let updated = 0;
  for (const row of rows) {
    const colors = await assignProductColors(String(row._id), { force: true });
    if (colors.length) {
      updated += 1;
      console.log(`${row._id} ${(row as any).title?.slice(0, 40)} → ${colors.map((c) => c.name).join(", ")}`);
    }
  }
  console.log(`Updated ${updated}/${rows.length} products`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
