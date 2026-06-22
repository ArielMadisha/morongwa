/**
 * Apply suggested marketplace top categories from a CSV edited after export.
 *
 * Expected columns (header row, case-insensitive):
 *   - id (required) — Mongo `_id` of the product
 *   - suggestedTopCategory (required) — one of MARKETPLACE_TOP_CATEGORIES
 *     Aliases: topCategory, suggested_top_category, category
 *
 * Optional CSV columns from export are ignored except id + suggested.
 *
 * Usage:
 *   npx tsx scripts/importProductCategoriesFromCsv.ts --file=./exports/uncategorized-products-2026-04-14.csv
 *   npx tsx scripts/importProductCategoriesFromCsv.ts --file=./my.csv --apply
 *   npx tsx scripts/importProductCategoriesFromCsv.ts --file=./my.csv --apply --replace-top
 *
 * Without --apply: dry run only (prints planned updates and errors).
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import Product from "../src/data/models/Product";
import { MARKETPLACE_TOP_CATEGORIES } from "../src/services/marketplaceCategoryClassifier";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const REPLACE_TOP = process.argv.includes("--replace-top");

function argValue(prefix: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(prefix));
  if (!a) return undefined;
  return a.slice(prefix.length).replace(/^=/, "");
}

function normalize(v: unknown): string {
  return String(v || "").trim();
}

function uniqueCaseInsensitive(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const v = normalize(item);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function removeKnownTopCategories(categories: string[]): string[] {
  const known = new Set(MARKETPLACE_TOP_CATEGORIES.map((c) => c.toLowerCase()));
  return categories.filter((c) => !known.has(c.toLowerCase()));
}

/** Canonical name from MARKETPLACE_TOP_CATEGORIES (exact match after trim). */
function resolveTopCategory(raw: string): string | null {
  const t = normalize(raw);
  if (!t) return null;
  const hit = MARKETPLACE_TOP_CATEGORIES.find((c) => c.toLowerCase() === t.toLowerCase());
  return hit ?? null;
}

/** Parse one CSV line; supports quoted fields with commas. */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      result.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function parseCsvFile(content: string): string[][] {
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  return lines.map(parseCsvLine);
}

function headerIndex(headers: string[], ...names: string[]): number {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const n of names) {
    const i = lower.indexOf(n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

async function main() {
  const filePath = argValue("--file");
  if (!filePath) {
    console.error("Missing --file=path/to.csv");
    process.exit(1);
  }

  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  const raw = fs.readFileSync(abs, "utf8");
  const rows = parseCsvFile(raw);
  if (rows.length < 2) {
    console.error("CSV must have a header row and at least one data row.");
    process.exit(1);
  }

  const headers = rows[0].map((h) => h.trim());
  const idIdx = headerIndex(headers, "id", "_id", "productId");
  const catIdx = headerIndex(
    headers,
    "suggestedTopCategory",
    "topCategory",
    "suggested_top_category",
    "category"
  );

  if (idIdx < 0) {
    console.error("CSV must include an id column (id, _id, or productId).");
    process.exit(1);
  }
  if (catIdx < 0) {
    console.error(
      "CSV must include a suggested category column: suggestedTopCategory, topCategory, or category."
    );
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  let planned = 0;
  let skippedEmpty = 0;
  let skippedInvalidId = 0;
  let skippedInvalidCategory = 0;
  let notFound = 0;
  let unchanged = 0;
  let updated = 0;

  const errors: string[] = [];
  const preview: string[] = [];

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    const idStr = normalize(cols[idIdx]);
    const suggestedRaw = (cols[catIdx] ?? "").trim();

    if (!idStr) continue;
    if (!suggestedRaw) {
      skippedEmpty++;
      continue;
    }

    if (!mongoose.Types.ObjectId.isValid(idStr)) {
      skippedInvalidId++;
      errors.push(`Row ${r + 1}: invalid id "${idStr}"`);
      continue;
    }

    const canonical = resolveTopCategory(suggestedRaw);
    if (!canonical) {
      skippedInvalidCategory++;
      errors.push(
        `Row ${r + 1}: unknown top category "${suggestedRaw}". Use one of: ${MARKETPLACE_TOP_CATEGORIES.join(" | ")}`
      );
      continue;
    }

    const p = await Product.findById(idStr).select("_id title categories").lean();
    if (!p) {
      notFound++;
      errors.push(`Row ${r + 1}: product not found ${idStr}`);
      continue;
    }

    const before = Array.isArray(p.categories) ? p.categories.map(normalize).filter(Boolean) : [];
    const base = REPLACE_TOP ? removeKnownTopCategories(before) : before;
    const after = uniqueCaseInsensitive([canonical, ...base]);
    const changed =
      after.length !== before.length ||
      after.some((value, idx) => value.toLowerCase() !== (before[idx] || "").toLowerCase());

    if (!changed) {
      unchanged++;
      continue;
    }

    planned++;
    if (preview.length < 20) {
      preview.push(
        `${idStr} :: ${normalize(p.title) || "(untitled)"} :: +${canonical} :: before=[${before.join(", ")}] :: after=[${after.join(", ")}]`
      );
    }

    if (APPLY) {
      await Product.updateOne({ _id: p._id }, { $set: { categories: after } });
      updated++;
    }
  }

  console.log(`CSV: ${abs}`);
  console.log(`Rows (data): ${rows.length - 1}`);
  console.log(`Planned updates: ${planned}`);
  console.log(`Skipped (empty suggested category): ${skippedEmpty}`);
  console.log(`Skipped (invalid id): ${skippedInvalidId}`);
  console.log(`Skipped (invalid category name): ${skippedInvalidCategory}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Unchanged (already had that top): ${unchanged}`);
  if (APPLY) {
    console.log(`Updated: ${updated}`);
  } else {
    console.log(`\nDry run only. Re-run with --apply to write updates.`);
  }
  if (REPLACE_TOP) {
    console.log(`Mode: --replace-top (existing top-level labels removed before merge).`);
  }

  if (preview.length > 0) {
    console.log("\nPreview:");
    for (const line of preview) console.log(`- ${line}`);
  }

  if (errors.length > 0) {
    console.log(`\nIssues (${errors.length}):`);
    for (const e of errors.slice(0, 40)) console.log(`- ${e}`);
    if (errors.length > 40) console.log(`... and ${errors.length - 40} more`);
  }

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
