/**
 * Inspect Qwertymates Facebook Page feed for duplicate marketplace posts,
 * delete extras (keep newest), and optionally clear stale facebookPostId on products.
 *
 * Usage (from backend/):
 *   npx tsx scripts/dedupeFacebookMarketplacePosts.ts --dry-run
 *   npx tsx scripts/dedupeFacebookMarketplacePosts.ts --limit=300
 *   npx tsx scripts/dedupeFacebookMarketplacePosts.ts --limit=300 --sleep-ms=1500
 */
import dotenv from "dotenv";
import path from "path";
import axios from "axios";
import mongoose from "mongoose";
import { connectDB } from "../src/data/db";
import Product from "../src/data/models/Product";
import {
  deleteFacebookPageObject,
  listFacebookPageFeedPosts,
  listManagedFacebookPages,
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
const sleepMs = argNum("--sleep-ms=", 1200);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function productIdFromMessage(message?: string): string | null {
  const m = String(message || "").match(/marketplace\/product\/([a-f0-9]{24})/i);
  return m ? m[1] : null;
}

function titleKey(message?: string): string {
  return String(message || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function dedupeKey(message?: string): string {
  const pid = productIdFromMessage(message);
  if (pid) return `pid:${pid}`;
  const t = titleKey(message);
  return t ? `title:${t}` : "";
}

async function main() {
  console.log(`Facebook marketplace dedupe — dryRun=${dryRun} limit=${limit}`);
  await connectDB();

  let pageId = getQwertymatesFacebookPageId();
  const pages = await listManagedFacebookPages();
  const named = pages.find((p) => /qwertymates/i.test(p.name || ""));
  if (named?.id) {
    console.log(`Using managed page ${named.name} (${named.id})`);
    pageId = named.id;
  } else {
    console.log(`Using configured page id ${pageId}`);
  }

  const posts = await listFacebookPageFeedPosts({ pageId, limit });
  console.log(`Fetched ${posts.length} feed posts`);

  const groups = new Map<string, typeof posts>();
  for (const p of posts) {
    const k = dedupeKey(p.message);
    if (!k) continue;
    const arr = groups.get(k) || [];
    arr.push(p);
    groups.set(k, arr);
  }

  const dupGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1);
  console.log(`Duplicate groups: ${dupGroups.length}`);

  let deleted = 0;
  let kept = 0;
  let failed = 0;
  const keepPostIds = new Set<string>();

  for (const [key, rows] of dupGroups) {
    const sorted = [...rows].sort((a, b) => String(b.createdTime || "").localeCompare(String(a.createdTime || "")));
    const keep = sorted[0];
    const remove = sorted.slice(1);
    keepPostIds.add(keep.id);
    kept++;
    console.log(
      `\nKEEP ${keep.id} (${keep.createdTime}) key=${key.slice(0, 70)} — remove ${remove.length}`
    );
    for (const r of remove) {
      console.log(`  DELETE ${r.id} (${r.createdTime})`);
      if (dryRun) {
        deleted++;
        continue;
      }
      try {
        await deleteFacebookPageObject(r.id);
        deleted++;
        // Clear facebookPostId if it pointed at the deleted post
        await Product.updateMany(
          { facebookPostId: r.id },
          { $unset: { facebookPostId: 1, facebookPostedAt: 1 } }
        );
        await sleep(sleepMs);
      } catch (e) {
        failed++;
        console.error(`  FAIL ${r.id}:`, (e as Error)?.message || e);
      }
    }
    // Ensure product keeps the surviving post id
    const pid = productIdFromMessage(keep.message);
    if (pid && !dryRun) {
      await Product.updateOne(
        { _id: pid },
        { $set: { facebookPostId: keep.id, facebookPostedAt: new Date(keep.createdTime || Date.now()) } }
      );
    }
  }

  // MongoDB: products sharing the same facebookPostId (bad data)
  const shared = await Product.aggregate([
    { $match: { facebookPostId: { $exists: true, $nin: [null, ""] } } },
    { $group: { _id: "$facebookPostId", count: { $sum: 1 }, ids: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  console.log(`\nMongo products sharing same facebookPostId: ${shared.length}`);
  if (!dryRun) {
    for (const row of shared) {
      const ids = (row.ids || []).map(String);
      // keep first product mapping; clear others
      for (const id of ids.slice(1)) {
        await Product.updateOne({ _id: id }, { $unset: { facebookPostId: 1, facebookPostedAt: 1 } });
        console.log(`Cleared shared facebookPostId on product ${id}`);
      }
    }
  }

  console.log(`\nDone. groups=${dupGroups.length} kept=${kept} deleted=${deleted} failed=${failed} dryRun=${dryRun}`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("Dedupe failed:", e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
