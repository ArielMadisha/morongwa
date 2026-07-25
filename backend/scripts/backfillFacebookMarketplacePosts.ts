/**
 * Backfill: post EXISTING (old) QwertyHub products to the Qwertymates Facebook Page.
 *
 * The create/activate hook (queueFacebookPostForProduct) only posts products going
 * forward. This script walks products that are publicly listable but were never
 * posted (no facebookPostId) and posts them, deduping and rate-limiting.
 *
 * Usage (from backend/):
 *   npm run facebook:marketplace-backfill -- --dry-run            # count + preview, no posts
 *   npm run facebook:marketplace-backfill                          # live, default limit
 *   npm run facebook:marketplace-backfill -- --limit=50 --sleep-ms=8000
 *   npm run facebook:marketplace-backfill -- --force   # repost even if facebookPostId set (fixes bad localhost links)
 *
 * Env: FACEBOOK_PAGE_ACCESS_TOKEN (valid page/user token with pages_manage_posts),
 *      FACEBOOK_QWERTYMATES_PAGE_ID, MONGO_URI, FRONTEND_URL/BACKEND_URL.
 */
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../src/data/db";
import mongoose from "mongoose";
import Product from "../src/data/models/Product";
import {
  buildPublicProductMatch,
  getApprovedSupplierIds,
} from "../src/services/publicProductListing";
import {
  debugFacebookAccessToken,
  missingFacebookPublishScopes,
} from "../src/services/facebookGraphApi";
import {
  getQwertymatesFacebookPageId,
  publishProductToQwertymatesFacebook,
} from "../src/services/facebookMarketplacePostService";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

function argNum(prefix: string, fallback: number): number {
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  if (!hit) return fallback;
  const n = parseInt(hit.slice(prefix.length).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const dryRun = process.argv.includes("--dry-run");
const forceRepost = process.argv.includes("--force");
const limit = argNum("--limit=", dryRun ? 1000 : 100);
const sleepMs = argNum("--sleep-ms=", 8000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("Facebook marketplace backfill — posting OLD products to Qwertymates Page ONLY");
  const pageId = getQwertymatesFacebookPageId();
  console.log(`Page id: ${pageId}`);
  const QWERTYMATES_ONLY = new Set(["427972753928205"]);
  if (!QWERTYMATES_ONLY.has(pageId)) {
    console.error(
      `Refusing to post: page id ${pageId} is not Qwertymates (427972753928205). Set FACEBOOK_QWERTYMATES_PAGE_ID=427972753928205`
    );
    process.exit(1);
  }
  console.log(`Mode: ${dryRun ? "DRY-RUN (no posts)" : "LIVE"}  limit=${limit}  sleep-ms=${sleepMs}${forceRepost ? "  force=repost" : ""}`);

  await connectDB();

  const approvedSupplierIds = await getApprovedSupplierIds();
  const publicMatch = buildPublicProductMatch(approvedSupplierIds);
  if (!publicMatch) {
    console.log("No public product match available (no approved suppliers / dropship). Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  // Only products that were never posted to Facebook (unless --force).
  const match = forceRepost
    ? { ...publicMatch }
    : {
        ...publicMatch,
        $and: [{ $or: [{ facebookPostId: { $exists: false } }, { facebookPostId: null }, { facebookPostId: "" }] }],
      };

  const pending = await Product.countDocuments(match);
  console.log(
    `\nPublicly listable products${forceRepost ? " (force repost)" : " never posted to Facebook"}: ${pending}`
  );

  if (dryRun) {
    const sample = await Product.find(match)
      .select("_id title price")
      .sort({ createdAt: 1 })
      .limit(Math.min(limit, 25))
      .lean();
    console.log(`\nPreview (first ${sample.length}):`);
    for (const p of sample) {
      console.log(`- ${p._id}  ${String(p.title || "").slice(0, 60)}  R${Number(p.price || 0).toFixed(2)}`);
    }
    console.log(`\nDry-run complete. Run without --dry-run to post (respects --limit / --sleep-ms).`);
    await mongoose.disconnect();
    return;
  }

  // Live mode: prefer a token check, but don't abort on transient Graph rate limits.
  try {
    const tokenDebug = await debugFacebookAccessToken();
    if (!tokenDebug.isValid) {
      console.error(
        "\nFacebook access token is INVALID or expired. Set a fresh long-lived FACEBOOK_PAGE_ACCESS_TOKEN in backend/.env and retry."
      );
      await mongoose.disconnect();
      process.exit(1);
    }
    const missing = missingFacebookPublishScopes(tokenDebug.scopes);
    if (missing.length) {
      console.error(`\nFacebook token missing scopes: ${missing.join(", ")}. Regenerate with pages_manage_posts.`);
      await mongoose.disconnect();
      process.exit(1);
    }
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    if (/403|request limit|#4\b|#17\b|#32\b/i.test(msg)) {
      console.warn(
        `\nToken debug rate-limited (${msg}). Continuing backfill without per-run debug_token check.`
      );
    } else if (/FACEBOOK_APP_SECRET|APP_ID and FACEBOOK_APP_SECRET/i.test(msg)) {
      console.warn(
        `\nToken debug skipped (${msg}). Continuing with FACEBOOK_PAGE_ACCESS_TOKEN only.`
      );
    } else {
      throw err;
    }
  }

  const targets = await Product.find(match)
    .select("_id title")
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();

  let posted = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];
    const label = `${i + 1}/${targets.length} ${p._id} ${String(p.title || "").slice(0, 50)}`;
    try {
      const result = await publishProductToQwertymatesFacebook(String(p._id), {
        force: forceRepost,
        skipTokenDebug: true,
      });
      if (result.ok && !("skipped" in result && result.skipped)) {
        posted++;
        console.log(`✓ posted   ${label}`);
      } else if (result.ok) {
        skipped++;
        console.log(`- skipped  ${label} (${(result as { reason?: string }).reason})`);
      } else {
        failed++;
        console.error(`✗ failed   ${label}: ${result.error}`);
        // Stop early only on auth/token/scope/rate-limit failures.
        if (
          /access token|oauth|permission|scope|session|expired|unsupported get request|application request limit reached|status code 403|#4\b|#17\b|#32\b|#368\b|\[368\]|limit how often you can post|spam/i.test(
            result.error
          )
        ) {
          console.error("Auth/rate-limit failure — stopping backfill. Retry later with longer --sleep-ms.");
          break;
        }
      }
    } catch (err) {
      failed++;
      const msg = String((err as Error)?.message || err);
      console.error(`✗ error    ${label}:`, msg);
      if (/status code 403|request limit|#4\b|#17\b|#32\b/i.test(msg)) {
        console.error("Rate-limit / 403 — stopping backfill. Retry later with longer --sleep-ms.");
        break;
      }
    }
    if (i < targets.length - 1) await sleep(sleepMs);
  }

  console.log(`\nBackfill complete. posted=${posted} skipped=${skipped} failed=${failed} (of ${targets.length})`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("Backfill failed:", e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
