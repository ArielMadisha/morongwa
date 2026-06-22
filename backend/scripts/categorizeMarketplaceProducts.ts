import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import Product from "../src/data/models/Product";
import {
  inferTopCategoryForProduct,
  MARKETPLACE_TOP_CATEGORIES,
} from "../src/services/marketplaceCategoryClassifier";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const FORCE_REPLACE_TOP = process.argv.includes("--force-replace-top");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split("=")[1] || 0)) : 0;

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

  const scoped = LIMIT > 0 ? docs.slice(0, LIMIT) : docs;
  let inferredCount = 0;
  let unchangedCount = 0;
  let noInferenceCount = 0;
  let updatedCount = 0;

  const preview: Array<{
    id: string;
    title: string;
    inferred: string | null;
    before: string[];
    after: string[];
  }> = [];

  for (const p of scoped) {
    const before = Array.isArray(p.categories) ? p.categories.map(normalize).filter(Boolean) : [];
    const inferredTop = inferTopCategoryForProduct({
      title: p.title,
      description: p.description,
      categories: before,
      tags: p.tags,
    });

    if (!inferredTop) {
      noInferenceCount += 1;
      if (preview.length < 15) {
        preview.push({
          id: String(p._id),
          title: normalize(p.title),
          inferred: null,
          before,
          after: before,
        });
      }
      continue;
    }

    inferredCount += 1;
    const base = FORCE_REPLACE_TOP ? removeKnownTopCategories(before) : before;
    const after = uniqueCaseInsensitive([inferredTop, ...base]);
    const changed =
      after.length !== before.length ||
      after.some((value, idx) => value.toLowerCase() !== (before[idx] || "").toLowerCase());

    if (!changed) {
      unchangedCount += 1;
      continue;
    }

    if (preview.length < 15) {
      preview.push({
        id: String(p._id),
        title: normalize(p.title),
        inferred: inferredTop,
        before,
        after,
      });
    }

    if (APPLY) {
      await Product.updateOne({ _id: p._id }, { $set: { categories: after } });
      updatedCount += 1;
    }
  }

  console.log(`Scanned active products: ${scoped.length}`);
  console.log(`Inferred top category: ${inferredCount}`);
  console.log(`No inference: ${noInferenceCount}`);
  console.log(`Already aligned: ${unchangedCount}`);
  console.log(`Would update: ${Math.max(0, inferredCount - unchangedCount)}`);
  console.log(`Updated: ${updatedCount}`);

  if (preview.length > 0) {
    console.log("\nPreview:");
    for (const row of preview) {
      console.log(
        `- ${row.id} :: ${row.title || "(untitled)"} :: inferred=${row.inferred || "none"} :: before=[${row.before.join(
          ", "
        )}] :: after=[${row.after.join(", ")}]`
      );
    }
  }

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to write updates.");
    console.log("Optional: add --force-replace-top to replace conflicting top-level labels.");
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

