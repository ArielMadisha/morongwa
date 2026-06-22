/**
 * Remove CJ / EPROLO / other dropship catalog + non–Cheap Store internal products.
 * Keeps only products tied to the Cheap Store supplier (by store slug/name).
 *
 * Dry-run (default):
 *   npx ts-node-dev --transpile-only --exit-child scripts/purgeDropshipKeepCheapStore.ts
 *
 * Apply (destructive):
 *   CONFIRM_PURGE_DROPSHIP_KEEP_CHEAP_STORE=yes npx ts-node-dev --transpile-only --exit-child scripts/purgeDropshipKeepCheapStore.ts --apply
 *
 * Optional env:
 *   CHEAP_STORE_SLUG=cheap-store
 *   CHEAP_STORE_NAME_REGEX=cheap
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import Product from "../src/data/models/Product";
import Supplier from "../src/data/models/Supplier";
import Store from "../src/data/models/Store";
import TVPost from "../src/data/models/TVPost";
import Cart from "../src/data/models/Cart";
import ResellerWall from "../src/data/models/ResellerWall";
import ProductEnquiry from "../src/data/models/ProductEnquiry";
import Advert from "../src/data/models/Advert";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DROPSHIP_SOURCES = ["cj", "eprolo", "spocket", "shein"] as const;
const APPLY = process.argv.includes("--apply");
const SLUG_HINT = (process.env.CHEAP_STORE_SLUG || "cheap").trim();
const NAME_REGEX = new RegExp(process.env.CHEAP_STORE_NAME_REGEX || "cheap", "i");

/** Legacy import / QA listings */
const TESTING_SLUG_RE = /-(cj|eprolo|spocket|shein)-/i;
const TESTING_TITLE_RE = /\b(test(ing)?|sample|demo|uat)\b/i;

async function resolveKeepSupplierIds(): Promise<{
  supplierIds: mongoose.Types.ObjectId[];
  stores: Array<{ _id: mongoose.Types.ObjectId; name: string; slug: string; supplierId?: mongoose.Types.ObjectId }>;
}> {
  const slugRe = new RegExp(SLUG_HINT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const stores = await Store.find({
    $or: [{ slug: slugRe }, { name: NAME_REGEX }],
    type: "supplier",
  })
    .select("_id name slug supplierId userId")
    .lean();

  const supplierIds = new Set<string>();
  for (const st of stores) {
    if (st.supplierId) supplierIds.add(String(st.supplierId));
    if (!st.supplierId && st.userId) {
      const sup = await Supplier.findOne({ userId: st.userId }).select("_id").lean();
      if (sup?._id) supplierIds.add(String(sup._id));
    }
  }

  const suppliersByName = await Supplier.find({ storeName: NAME_REGEX }).select("_id storeName").lean();
  for (const s of suppliersByName) {
    if (s._id) supplierIds.add(String(s._id));
  }

  return {
    supplierIds: [...supplierIds].map((id) => new mongoose.Types.ObjectId(id)),
    stores: stores.map((s) => ({
      _id: s._id as mongoose.Types.ObjectId,
      name: String(s.name || ""),
      slug: String(s.slug || ""),
      supplierId: s.supplierId as mongoose.Types.ObjectId | undefined,
    })),
  };
}

function buildDeleteFilter(keepSupplierIds: mongoose.Types.ObjectId[]): Record<string, unknown> {
  const keepList = keepSupplierIds.length > 0 ? keepSupplierIds : [new mongoose.Types.ObjectId("000000000000000000000000")];

  return {
    $or: [
      { supplierSource: { $in: [...DROPSHIP_SOURCES] } },
      { slug: { $regex: TESTING_SLUG_RE } },
      {
        supplierSource: { $in: ["internal", null] },
        supplierId: { $nin: keepList },
      },
      {
        supplierSource: { $in: ["internal", null] },
        supplierId: { $exists: false },
      },
      {
        supplierId: { $nin: keepList },
        title: { $regex: TESTING_TITLE_RE },
      },
    ],
  };
}

async function cascadeDeleteProducts(productIds: mongoose.Types.ObjectId[]): Promise<number> {
  if (!productIds.length) return 0;
  await Promise.all([
    ProductEnquiry.deleteMany({ productId: { $in: productIds } }),
    ResellerWall.updateMany(
      { "products.productId": { $in: productIds } },
      { $pull: { products: { productId: { $in: productIds } } } }
    ),
    Cart.updateMany(
      { "items.productId": { $in: productIds } },
      { $pull: { items: { productId: { $in: productIds } } } }
    ),
    Advert.updateMany({ productId: { $in: productIds } }, { $unset: { productId: "" } }),
    TVPost.updateMany({ productId: { $in: productIds } }, { $unset: { productId: "" } }),
  ]);
  const delTvProductPosts = await TVPost.deleteMany({
    type: "product",
    productId: { $in: productIds },
  });
  if (delTvProductPosts.deletedCount) {
    console.log(`Deleted TV product posts: ${delTvProductPosts.deletedCount}`);
  }
  const result = await Product.deleteMany({ _id: { $in: productIds } });
  return result.deletedCount ?? 0;
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const { supplierIds: keepSupplierIds, stores } = await resolveKeepSupplierIds();
  if (!keepSupplierIds.length) {
    console.error(
      `No Cheap Store supplier found (slug hint "${SLUG_HINT}", name /${NAME_REGEX.source}/). Set CHEAP_STORE_SLUG or CHEAP_STORE_NAME_REGEX. Aborting.`
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  const deleteFilter = buildDeleteFilter(keepSupplierIds);
  const toDelete = await Product.find(deleteFilter).select("_id title slug supplierSource supplierId").lean();
  const keepCount = await Product.countDocuments({ supplierId: { $in: keepSupplierIds } });
  const bySource = await Product.aggregate([
    { $group: { _id: "$supplierSource", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const sampleDelete = toDelete.slice(0, 15).map((p) => ({
    id: String(p._id),
    title: p.title,
    slug: p.slug,
    source: p.supplierSource,
  }));

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        keepStores: stores,
        keepSupplierIds: keepSupplierIds.map(String),
        productsKeptForCheapStore: keepCount,
        productsToDelete: toDelete.length,
        catalogBySupplierSource: bySource,
        sampleProductsToDelete: sampleDelete,
        ordersNote: "Orders are not modified.",
      },
      null,
      2
    )
  );

  if (!APPLY) {
    console.log("\nTo apply, run:");
    console.log(
      "  CONFIRM_PURGE_DROPSHIP_KEEP_CHEAP_STORE=yes npx ts-node-dev --transpile-only --exit-child scripts/purgeDropshipKeepCheapStore.ts --apply"
    );
    await mongoose.disconnect();
    return;
  }

  if (String(process.env.CONFIRM_PURGE_DROPSHIP_KEEP_CHEAP_STORE || "").trim().toLowerCase() !== "yes") {
    console.error("Set CONFIRM_PURGE_DROPSHIP_KEEP_CHEAP_STORE=yes to run --apply");
    await mongoose.disconnect();
    process.exit(1);
  }

  const ids = toDelete.map((p) => p._id as mongoose.Types.ObjectId);
  const deleted = await cascadeDeleteProducts(ids);
  const remaining = await Product.countDocuments({});

  console.log(JSON.stringify({ deletedProducts: deleted, remainingProducts: remaining }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
