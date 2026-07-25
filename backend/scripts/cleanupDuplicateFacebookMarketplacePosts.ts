/**
 * Delete duplicate Qwertymates Facebook Page marketplace product posts.
 *
 * Groups posts that contain a QwertyHub product URL by product id, keeps the
 * newest post in each group (or the one stored on Product.facebookPostId), and
 * deletes the rest.
 *
 * Usage (from backend/):
 *   npx tsx scripts/cleanupDuplicateFacebookMarketplacePosts.ts --dry-run
 *   npx tsx scripts/cleanupDuplicateFacebookMarketplacePosts.ts --limit=200
 *   npx tsx scripts/cleanupDuplicateFacebookMarketplacePosts.ts --sleep-ms=2000
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { connectDB } from "../src/data/db";
import Product from "../src/data/models/Product";
import {
  deleteFacebookPageObject,
  formatFacebookGraphError,
  listFacebookPageFeedPosts,
} from "../src/services/facebookGraphApi";
import { getQwertymatesFacebookPageId } from "../src/services/facebookMarketplacePostService";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

function argNum(prefix: string, fallback: number): number {
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  if (!hit) return fallback;
  const n = parseInt(hit.slice(prefix.length).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const dryRun = process.argv.includes("--dry-run");
const limit = argNum("--limit=", 250);
const sleepMs = argNum("--sleep-ms=", 1500);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PRODUCT_ID_RE =
  /(?:qwertymates\.com|localhost:\d+)\/marketplace\/product\/([a-f0-9]{24})/i;

type FeedPost = {
  id: string;
  message?: string;
  createdTime?: string;
  permalinkUrl?: string;
  productId?: string;
};

function extractProductId(message?: string): string | undefined {
  if (!message) return undefined;
  const m = message.match(PRODUCT_ID_RE);
  return m?.[1]?.toLowerCase();
}

async function main() {
  const pageId = getQwertymatesFacebookPageId();
  console.log("Cleanup duplicate Facebook marketplace posts");
  console.log(`Page id: ${pageId}`);
  console.log(`Mode: ${dryRun ? "DRY-RUN" : "LIVE DELETE"}  feed-limit=${limit}  sleep-ms=${sleepMs}`);

  await connectDB();

  const feed = await listFacebookPageFeedPosts({ pageId, limit });
  const marketplacePosts: FeedPost[] = feed
    .map((p) => ({ ...p, productId: extractProductId(p.message) }))
    .filter((p) => Boolean(p.productId));

  console.log(`\nFetched ${feed.length} recent Page posts; ${marketplacePosts.length} look like marketplace product posts.`);

  const byProduct = new Map<string, FeedPost[]>();
  for (const post of marketplacePosts) {
    const key = post.productId!;
    const list = byProduct.get(key) || [];
    list.push(post);
    byProduct.set(key, list);
  }

  const duplicateGroups = [...byProduct.entries()].filter(([, posts]) => posts.length > 1);
  console.log(`Products with duplicate posts: ${duplicateGroups.length}`);

  if (!duplicateGroups.length) {
    console.log("Nothing to delete.");
    await mongoose.disconnect();
    return;
  }

  let deleted = 0;
  let kept = 0;
  let failed = 0;

  for (const [productId, posts] of duplicateGroups) {
    const sorted = [...posts].sort((a, b) => {
      const ta = a.createdTime ? Date.parse(a.createdTime) : 0;
      const tb = b.createdTime ? Date.parse(b.createdTime) : 0;
      return tb - ta;
    });

    const product = await Product.findById(productId).select("title facebookPostId").lean();
    const preferredId = String(product?.facebookPostId || "").trim();
    const keep =
      (preferredId && sorted.find((p) => p.id === preferredId || p.id.endsWith(`_${preferredId}`) || preferredId.endsWith(p.id))) ||
      sorted[0];
    const remove = sorted.filter((p) => p.id !== keep.id);

    kept++;
    console.log(
      `\n${productId}  ${String(product?.title || "").slice(0, 50)}  keep=${keep.id}  delete=${remove.length}`
    );

    for (const post of remove) {
      if (dryRun) {
        console.log(`  [dry-run] would delete ${post.id} (${post.createdTime || "no date"})`);
        deleted++;
        continue;
      }
      try {
        await deleteFacebookPageObject(post.id);
        console.log(`  ✓ deleted ${post.id}`);
        deleted++;
        await sleep(sleepMs);
      } catch (err) {
        failed++;
        console.error(`  ✗ failed ${post.id}: ${formatFacebookGraphError(err)}`);
        const msg = formatFacebookGraphError(err);
        if (/access token|oauth|permission|request limit|#4\b|#17\b|403/i.test(msg)) {
          console.error("Stopping on auth/rate-limit error.");
          console.log(`\nStopped early. deleted=${deleted} kept-groups=${kept} failed=${failed}`);
          await mongoose.disconnect();
          process.exit(1);
        }
      }
    }

    // Ensure DB points at the kept post.
    if (!dryRun && product && product.facebookPostId !== keep.id) {
      await Product.updateOne(
        { _id: productId },
        { $set: { facebookPostId: keep.id, facebookPostedAt: keep.createdTime ? new Date(keep.createdTime) : new Date() } }
      );
    }
  }

  console.log(`\nDone. duplicate-groups=${duplicateGroups.length} deleted=${deleted} failed=${failed}${dryRun ? " (dry-run)" : ""}`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("Cleanup failed:", e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
