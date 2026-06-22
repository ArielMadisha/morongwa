/**
 * Export active products where inferTopCategoryForProduct returns null
 * (same definition as "683 uncategorized" in the categorization pass).
 *
 * Usage:
 *   npx tsx scripts/exportUncategorizedProducts.ts
 *   npx tsx scripts/exportUncategorizedProducts.ts --out=./exports/uncategorized-products.csv
 *
 * After manual review, add a column `suggestedTopCategory` (valid top-level name) and apply:
 *   npx tsx scripts/importProductCategoriesFromCsv.ts --file=./exports/your-edited.csv --apply
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import Product from "../src/data/models/Product";
import { inferTopCategoryForProduct } from "../src/services/marketplaceCategoryClassifier";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

function escapeCsvField(value: string): string {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  const outArg = process.argv.find((a) => a.startsWith("--out="));
  const defaultName = `uncategorized-products-${new Date().toISOString().slice(0, 10)}.csv`;
  const outPath = outArg
    ? path.resolve(process.cwd(), outArg.split("=").slice(1).join("="))
    : path.resolve(__dirname, "../exports", defaultName);

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  const docs = await Product.find({ active: true })
    .select("_id title description categories tags supplierSource")
    .lean();

  const rows: Array<{
    id: string;
    title: string;
    categories: string;
    supplierSource: string;
  }> = [];

  for (const p of docs) {
    const inferred = inferTopCategoryForProduct({
      title: p.title,
      description: p.description,
      categories: p.categories,
      tags: p.tags,
    });
    if (inferred != null) continue;

    const cats = Array.isArray(p.categories) ? p.categories.map((c) => String(c || "").trim()).filter(Boolean) : [];
    rows.push({
      id: String(p._id),
      title: String(p.title || "").trim(),
      categories: cats.join(" | "),
      supplierSource: String((p as { supplierSource?: string }).supplierSource || "internal"),
    });
  }

  const header = ["id", "title", "categories", "supplierSource"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [r.id, r.title, r.categories, r.supplierSource].map(escapeCsvField).join(",")
    ),
  ];

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");

  console.log(`Active products scanned: ${docs.length}`);
  console.log(`Uncategorized (no classifier top match): ${rows.length}`);
  console.log(`Wrote: ${outPath}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
