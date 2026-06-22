/**
 * Diagnose Facebook Graph token + try loading posts for an ingest Page slug.
 *
 *   npm run facebook-tv:probe
 *   npm run facebook-tv:probe -- --page=DumaFM
 *   npm run facebook-tv:probe -- --exchange   (short-lived → long-lived, prints new token)
 */

import dotenv from "dotenv";
import path from "path";
import axios from "axios";
import {
  debugFacebookAccessToken,
  exchangeFacebookLongLivedUserToken,
  fetchFacebookPagePosts,
  formatFacebookGraphError,
  listManagedFacebookPages,
  resolveFacebookPageId,
} from "../src/services/facebookGraphApi";
import { FACEBOOK_TV_INGEST_SLOTS } from "../src/config/facebookTvIngest";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REQUIRED_SCOPES = ["pages_read_engagement", "pages_show_list"];

function argValue(prefix: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  if (!hit) return undefined;
  return hit.slice(prefix.length).trim() || undefined;
}

function printExplorerSteps(missing: string[]) {
  const appId = process.env.FACEBOOK_APP_ID || "YOUR_APP_ID";
  console.log("\n--- Fix in Graph API Explorer (https://developers.facebook.com/tools/explorer/) ---");
  console.log("1. Meta App: Qwertymates");
  console.log("2. User or Page: User Token");
  console.log("3. Click \"Add a Permission\" and add:");
  for (const s of missing.length ? missing : REQUIRED_SCOPES) {
    console.log(`   - ${s}`);
  }
  console.log("4. Click \"Generate Access Token\" and approve the prompt (re-login if asked).");
  console.log("5. Test in the explorer URL bar:");
  console.log("   DumaFM?fields=id,name");
  console.log("   then: DumaFM/posts?fields=id,message,created_time,full_picture&limit=3");
  console.log("6. Copy the full token → backend/.env as FACEBOOK_PAGE_ACCESS_TOKEN=...");
  console.log("\nThird-party Pages (Duma FM, GOAL, etc.) also need App Review:");
  console.log("   Feature: Page Public Content Access");
  console.log(`   https://developers.facebook.com/apps/${appId}/app-review/permissions/`);
  console.log("   (App secret alone cannot read Page posts.)");
  console.log("\nOptional long-lived token from this machine:");
  console.log("   npm run facebook-tv:probe -- --exchange");
}

async function main() {
  const pageSlug = argValue("--page=") || FACEBOOK_TV_INGEST_SLOTS[0]?.pageSlug || "DumaFM";
  const doExchange = process.argv.includes("--exchange");

  const appId = (process.env.FACEBOOK_APP_ID || "").trim();
  const appSecret = (process.env.FACEBOOK_APP_SECRET || "").trim();
  const token = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN || "").trim();

  console.log("Facebook Graph probe");
  console.log("  FACEBOOK_APP_ID:", appId ? "set" : "MISSING");
  console.log("  FACEBOOK_APP_SECRET:", appSecret ? "set" : "MISSING");
  console.log("  access token:", token ? `set (${token.length} chars)` : "MISSING");

  if (!appId || !appSecret || !token) {
    printExplorerSteps(REQUIRED_SCOPES);
    process.exit(1);
  }

  if (doExchange) {
    try {
      const long = await exchangeFacebookLongLivedUserToken(token);
      console.log("\nLong-lived user token (paste into FACEBOOK_PAGE_ACCESS_TOKEN):");
      console.log(long);
      console.log("\nRe-run probe without --exchange to verify scopes.");
    } catch (e) {
      console.error("Exchange failed:", formatFacebookGraphError(e));
      process.exit(1);
    }
    return;
  }

  let debug;
  try {
    debug = await debugFacebookAccessToken();
  } catch (e) {
    console.error("debug_token failed:", formatFacebookGraphError(e));
    process.exit(1);
  }

  console.log("\nToken debug:");
  console.log("  type:", debug.type);
  console.log("  valid:", debug.isValid);
  console.log("  expires:", debug.expiresAt ? new Date(debug.expiresAt * 1000).toISOString() : "n/a");
  console.log("  scopes:", debug.scopes.length ? debug.scopes.join(", ") : "(none)");

  if (!debug.isValid) {
    console.error("\nToken is invalid. Generate a new one in Graph API Explorer.");
    printExplorerSteps(REQUIRED_SCOPES);
    process.exit(1);
  }

  const missing = REQUIRED_SCOPES.filter((s) => !debug.scopes.includes(s));
  if (missing.length) {
    console.error("\nMissing permissions on this token:", missing.join(", "));
    printExplorerSteps(missing);
    process.exit(1);
  }

  const pages = await listManagedFacebookPages();
  console.log("\nPages you manage (me/accounts):", pages.length);
  for (const p of pages.slice(0, 10)) {
    console.log(`  - ${p.name || p.id} (@${p.username || "?"}) id=${p.id}`);
  }
  if (!pages.length) {
    console.log("  (none — OK for third-party ingest if Page Public Content Access is approved)");
  }

  console.log(`\nResolving Page slug: ${pageSlug}`);
  try {
    const { id, name } = await resolveFacebookPageId(pageSlug);
    console.log(`  OK: ${name || pageSlug} → id ${id}`);

    const posts = await fetchFacebookPagePosts(id, 3);
    console.log(`\nLatest posts (${posts.length}):`);
    for (const p of posts) {
      const preview = (p.message || "").replace(/\s+/g, " ").slice(0, 80);
      console.log(`  - ${p.id} [${p.media.kind}] ${preview || "(no text)"}`);
    }
    if (!posts.length) {
      console.log("  (no posts returned — Page may have no public posts or API limit)");
    }
    console.log("\nProbe passed. Run: npm run facebook-tv:ingest -- --page=" + pageSlug);
  } catch (e) {
    const msg = formatFacebookGraphError(e);
    console.error("\nFailed to load Page posts:", msg);
    if (msg.includes("100") || msg.toLowerCase().includes("page public content")) {
      console.error(
        "\nYour token has Page permissions, but Meta blocks third-party Pages until",
        "Page Public Content Access is approved for app Qwertymates."
      );
    }
    printExplorerSteps([]);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
