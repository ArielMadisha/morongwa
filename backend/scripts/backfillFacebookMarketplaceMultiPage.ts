/**
 * Backfill: post publicly listable QwertyHub products to managed Facebook Pages
 * without duplicating per page.
 *
 * Pages (default): Qwertymates, BMedia.Online (aka Bmeida.Online), BuyAfrika
 *
 * Dedup:
 * - Qwertymates: product.facebookPostId OR facebookPagePosts[pageId]
 * - Other pages: facebookPagePosts[pageId] only
 *
 * Usage (from backend/):
 *   npm run facebook:marketplace-multipage -- --dry-run
 *   npm run facebook:marketplace-multipage -- --pages=qwertymates,bmeida,buyafrika --limit=50
 *   npm run facebook:marketplace-multipage -- --pages=buyafrika --limit=20 --sleep-ms=10000
 *
 * Token: set FACEBOOK_PAGE_ACCESS_TOKEN in env, or place in
 *   exports/facebook-marketplace-token.local.env  (gitignored under exports/)
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { connectDB } from "../src/data/db";
import Product from "../src/data/models/Product";
import {
  buildPublicProductMatch,
  getApprovedSupplierIds,
} from "../src/services/publicProductListing";
import {
  debugFacebookAccessToken,
  listManagedFacebookPages,
  missingFacebookPublishScopes,
} from "../src/services/facebookGraphApi";
import {
  FACEBOOK_MARKETPLACE_PAGES,
  FacebookMarketplacePageKey,
  getMarketplacePageId,
  productAlreadyPostedToPage,
  publishProductToFacebookPage,
  resolveMarketplacePageKey,
} from "../src/services/facebookMarketplacePostService";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

/** Load Facebook tokens from gitignored exports file if present (never commit). */
function loadLocalTokenFile(): void {
  const tokenPath = path.resolve(__dirname, "../exports/facebook-marketplace-token.local.env");
  if (!fs.existsSync(tokenPath)) return;
  const raw = fs.readFileSync(tokenPath, "utf8");
  let loaded = 0;
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
    if (!m?.[1] || !m[2]) continue;
    if (!m[1].startsWith("FACEBOOK_")) continue;
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    loaded++;
  }
  if (loaded) {
    const len = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "").length;
    console.log(
      `Loaded ${loaded} FACEBOOK_* keys from exports/facebook-marketplace-token.local.env (user token len=${len})`
    );
  }
}

loadLocalTokenFile();

// Stale FACEBOOK_*_PAGE_ACCESS_TOKEN values in backend/.env (expired Jul 2026) must not
// override a fresh user token from the local exports file — they caused [190] Session expired
// when /me/accounts was rate-limited and publish fell back to the dedicated page token.
{
  const localPath = path.resolve(__dirname, "../exports/facebook-marketplace-token.local.env");
  let localKeys = new Set<string>();
  if (fs.existsSync(localPath)) {
    for (const line of fs.readFileSync(localPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
      if (m?.[1]?.startsWith("FACEBOOK_")) localKeys.add(m[1]);
    }
  }
  for (const key of [
    "FACEBOOK_QWERTYMATES_PAGE_ACCESS_TOKEN",
    "FACEBOOK_BUYAFRIKA_PAGE_ACCESS_TOKEN",
    "FACEBOOK_BMEIDA_PAGE_ACCESS_TOKEN",
    "FACEBOOK_BMEDIA_PAGE_ACCESS_TOKEN",
  ]) {
    if (!localKeys.has(key) && process.env[key]) {
      delete process.env[key];
      console.log(`Cleared stale ${key} from process env (not in local token file)`);
    }
  }
}

function argNum(prefix: string, fallback: number): number {
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  if (!hit) return fallback;
  const n = parseInt(hit.slice(prefix.length).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function argValue(prefix: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  if (!hit) return undefined;
  return hit.slice(prefix.length).trim() || undefined;
}

const dryRun = process.argv.includes("--dry-run");
const forceRepost = process.argv.includes("--force");
const limit = argNum("--limit=", dryRun ? 5000 : 200);
const sleepMs = argNum("--sleep-ms=", 8000);
const pagesArg = argValue("--pages=") || "qwertymates,bmeida,buyafrika";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parsePageKeys(raw: string): FacebookMarketplacePageKey[] {
  const keys: FacebookMarketplacePageKey[] = [];
  for (const part of raw.split(/[,+\s]+/).map((s) => s.trim()).filter(Boolean)) {
    const key = resolveMarketplacePageKey(part);
    if (!key) {
      console.error(`Unknown page "${part}". Use: qwertymates, bmeida (BMedia.Online), buyafrika`);
      process.exit(1);
    }
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

async function main() {
  const pageKeys = parsePageKeys(pagesArg);
  console.log("Facebook marketplace multi-page backfill");
  console.log(`Mode: ${dryRun ? "DRY-RUN" : "LIVE"}  limit=${limit}/page  sleep-ms=${sleepMs}${forceRepost ? "  force" : ""}`);

  const managed = await listManagedFacebookPages();
  const managedById = new Map(managed.map((p) => [p.id, p]));
  console.log(`Managed pages visible to token: ${managed.length}`);
  for (const p of managed) {
    console.log(`  - ${p.name || "?"} (${p.id})`);
  }

  const targets = pageKeys.map((key) => {
    const meta = FACEBOOK_MARKETPLACE_PAGES[key];
    const pageId = getMarketplacePageId(key);
    const hit = managedById.get(pageId) || managed.find((p) => (p.name || "").toLowerCase() === meta.name.toLowerCase());
    return { key, pageId: hit?.id || pageId, name: hit?.name || meta.name, hasToken: Boolean(hit?.accessToken) };
  });

  for (const t of targets) {
    console.log(`Target: ${t.name} key=${t.key} id=${t.pageId} pageToken=${t.hasToken ? "yes" : "no"}`);
    if (!t.hasToken && managed.length) {
      console.warn(`  WARNING: page id ${t.pageId} not in /me/accounts — publish may fail.`);
    }
  }

  // Prefer token debug, but do not abort on app-secret signature mismatch.
  try {
    const tokenDebug = await debugFacebookAccessToken();
    if (!tokenDebug.isValid) {
      console.error("Facebook access token is INVALID or expired.");
      process.exit(1);
    }
    const missing = missingFacebookPublishScopes(tokenDebug.scopes);
    if (missing.length) {
      console.error(`Token missing scopes: ${missing.join(", ")}`);
      process.exit(1);
    }
    console.log(`Token ok. scopes=${tokenDebug.scopes.join(",")}`);
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    console.warn(`Token debug skipped (${msg}). Continuing with /me/accounts-proven token.`);
  }

  await connectDB();

  const approvedSupplierIds = await getApprovedSupplierIds();
  const publicMatch = buildPublicProductMatch(approvedSupplierIds);
  if (!publicMatch) {
    console.log("No public products available. Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  const summary: Record<string, { uploaded: number; skipped: number; failed: number; pending: number }> = {};

  for (const t of targets) {
    summary[t.key] = { uploaded: 0, skipped: 0, failed: 0, pending: 0 };

    const allPublic = await Product.find(publicMatch)
      .select("_id title price facebookPostId facebookPagePosts createdAt")
      .sort({ createdAt: 1 })
      .lean();

    const pending = forceRepost
      ? allPublic
      : allPublic.filter((p) => !productAlreadyPostedToPage(p, t.key, t.pageId));

    summary[t.key].pending = pending.length;
    console.log(`\n=== ${t.name} (${t.pageId}) — pending ${pending.length} of ${allPublic.length} public ===`);

    if (dryRun) {
      for (const p of pending.slice(0, Math.min(10, limit))) {
        console.log(`  would post ${p._id}  ${String(p.title || "").slice(0, 55)}`);
      }
      continue;
    }

    const batch = pending.slice(0, limit);
    for (let i = 0; i < batch.length; i++) {
      const p = batch[i];
      const label = `${i + 1}/${batch.length} ${p._id} ${String(p.title || "").slice(0, 45)}`;
      try {
        const result = await publishProductToFacebookPage(String(p._id), t.key, {
          force: forceRepost,
          skipTokenDebug: true,
        });
        if (result.ok && !("skipped" in result && result.skipped)) {
          summary[t.key].uploaded++;
          console.log(`✓ uploaded ${label}`);
        } else if (result.ok) {
          summary[t.key].skipped++;
          console.log(`- skipped  ${label} (${(result as { reason?: string }).reason})`);
        } else {
          summary[t.key].failed++;
          console.error(`✗ failed   ${label}: ${result.error}`);
          if (
            /access token|oauth|permission|scope|session|expired|unsupported get request|application request limit reached|status code 403|#4\b|#17\b|#32\b|#368\b|\[368\]|limit how often you can post|spam/i.test(
              result.error
            )
          ) {
            console.error("Auth/rate-limit failure — stopping this page. Retry later with longer --sleep-ms.");
            break;
          }
        }
      } catch (err) {
        summary[t.key].failed++;
        const msg = String((err as Error)?.message || err);
        console.error(`✗ error    ${label}:`, msg);
        if (/status code 403|request limit|#4\b|#17\b|#32\b/i.test(msg)) {
          console.error("Rate-limit / 403 — stopping this page.");
          break;
        }
      }
      if (i < batch.length - 1) await sleep(sleepMs);
    }
  }

  console.log("\n========== SUMMARY ==========");
  for (const t of targets) {
    const s = summary[t.key];
    console.log(
      `${t.name}: uploaded=${s.uploaded} skipped=${s.skipped} failed=${s.failed} pendingBefore=${s.pending}`
    );
  }

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("Multi-page backfill failed:", e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
