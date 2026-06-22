import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import Product from "../src/data/models/Product";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split("=")[1] || 0)) : 0;

const MEN_CATEGORY = "Men's Clothing";

function normalize(v: unknown): string {
  return String(v || "").trim();
}

function hasMensSignal(blob: string): boolean {
  // Keep this intentionally focused on explicit men's wording for now.
  return /\bmen['’]s\b|\bmens\b|\bman\b|\bmale\b|\bgentlemen\b/i.test(blob);
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  const docs = await Product.find({ active: true })
    .select("_id title description categories tags")
    .lean();

  const matches = docs.filter((p) => {
    const haystack = [
      normalize(p.title),
      normalize(p.description),
      ...(Array.isArray(p.categories) ? p.categories.map(normalize) : []),
      ...(Array.isArray(p.tags) ? p.tags.map(normalize) : []),
    ].join(" ");
    return hasMensSignal(haystack);
  });

  const toTag = matches.filter((p) => {
    const cats = Array.isArray(p.categories) ? p.categories.map(normalize) : [];
    return !cats.some((c) => c.toLowerCase() === MEN_CATEGORY.toLowerCase());
  });

  const preview = (LIMIT > 0 ? toTag.slice(0, LIMIT) : toTag).slice(0, 20);
  console.log(`Scanned active products: ${docs.length}`);
  console.log(`Matched men's signals: ${matches.length}`);
  console.log(`Need '${MEN_CATEGORY}' tag: ${toTag.length}`);
  if (preview.length > 0) {
    console.log("\nPreview:");
    for (const p of preview) {
      console.log(`- ${p._id} :: ${normalize(p.title)}`);
    }
  }

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to write updates.");
    await mongoose.disconnect();
    return;
  }

  const target = LIMIT > 0 ? toTag.slice(0, LIMIT) : toTag;
  let updated = 0;
  for (const p of target) {
    const existing = Array.isArray(p.categories) ? p.categories.map(normalize).filter(Boolean) : [];
    const next = [...existing, MEN_CATEGORY];
    await Product.updateOne({ _id: p._id }, { $set: { categories: next } });
    updated += 1;
  }

  console.log(`\nUpdated products: ${updated}`);
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

