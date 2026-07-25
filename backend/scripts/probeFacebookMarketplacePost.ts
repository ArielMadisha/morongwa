/**
 * Probe Facebook token for marketplace auto-post to Qwertymates Page.
 *
 *   npm run facebook:marketplace-probe
 *   npm run facebook:marketplace-probe -- --product=<mongoId>   (live post one product)
 */

import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../src/data/db";
import {
  debugFacebookAccessToken,
  listManagedFacebookPages,
  missingFacebookPublishScopes,
} from "../src/services/facebookGraphApi";
import {
  getQwertymatesFacebookPageId,
  publishProductToQwertymatesFacebook,
} from "../src/services/facebookMarketplacePostService";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

function argValue(prefix: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  if (!hit) return undefined;
  return hit.slice(prefix.length).trim() || undefined;
}

async function main() {
  const pageId = getQwertymatesFacebookPageId();
  console.log("Qwertymates Facebook Page id:", pageId);
  console.log("Page URL: https://www.facebook.com/profile.php?id=" + pageId);

  const debug = await debugFacebookAccessToken();
  console.log("\nToken:", debug.isValid ? "valid" : "INVALID", `type=${debug.type}`);
  console.log("Scopes:", debug.scopes.join(", ") || "(none)");
  const missing = missingFacebookPublishScopes(debug.scopes);
  if (missing.length) {
    console.log("\nMissing for marketplace POST:", missing.join(", "));
    console.log("In Graph API Explorer add: pages_manage_posts, pages_read_engagement, pages_show_list");
    console.log("Generate token → set FACEBOOK_PAGE_ACCESS_TOKEN in backend/.env");
    process.exit(1);
  }

  const pages = await listManagedFacebookPages();
  const managed = pages.find((p) => p.id === pageId);
  console.log("\nManaged pages:", pages.map((p) => `${p.name || p.id} (${p.id})`).join("; ") || "(none)");
  if (managed) {
    console.log("✓ Qwertymates Page found in /me/accounts:", managed.name);
  } else {
    const qw = pages.find((p) => (p.name || "").toLowerCase() === "qwertymates");
    if (qw) {
      console.log(
        `Note: FACEBOOK_QWERTYMATES_PAGE_ID=${pageId} — posts will use Graph Page id ${qw.id} (${qw.name})`
      );
    }
  }

  const productId = argValue("--product=");
  if (productId) {
    await connectDB();
    console.log("\nPosting product", productId, "...");
    const result = await publishProductToQwertymatesFacebook(productId, { force: true });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }

  console.log("\nProbe OK. Test live post:");
  console.log("  npm run facebook:marketplace-probe -- --product=<productMongoId>");
}

main().catch((e) => {
  console.error("Probe failed:", e?.message || e);
  process.exit(1);
});
