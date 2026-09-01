/**
 * Fill App Store Connect listing for Qwertymates (ascAppId 6798004708).
 *
 * Requires ASC API key locally (gitignored):
 *   ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY_PATH  (or EXPO_ASC_*)
 *
 * Or pass --issuer / --key-id / --key-path
 *
 * Usage (from mobile/):
 *   node scripts/ascFillListing.mjs
 *   node scripts/ascFillListing.mjs --submit-review
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(__dirname, "..");
const GRAPHICS = path.resolve(
  MOBILE_ROOT,
  "../../App Stores Graphics/IOS/Qwertymates"
);
const LISTING_MD = path.join(GRAPHICS, "docs/03-APP-STORE-LISTING.md");
const ASC_APP_ID = "6798004708";
const BUNDLE_ID = "com.qwertymates.app";

const args = process.argv.slice(2);
const WANT_SUBMIT = args.includes("--submit-review");
const DRY = args.includes("--dry-run");
const VERSION_STRING =
  argVal("--version-string") || process.env.ASC_VERSION_STRING || "1.0";
const WANT_BUILD_NUMBER = argVal("--build-number") || process.env.ASC_BUILD_NUMBER || null;

function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(MOBILE_ROOT, ".env"));
loadEnvFile(path.join(MOBILE_ROOT, "..", "backend", ".env"));

const issuerId =
  argVal("--issuer") ||
  process.env.ASC_ISSUER_ID ||
  process.env.EXPO_ASC_ISSUER_ID;
const keyId =
  argVal("--key-id") || process.env.ASC_KEY_ID || process.env.EXPO_ASC_KEY_ID || "2SAQZ4V7X9";
const keyPath =
  argVal("--key-path") ||
  process.env.ASC_PRIVATE_KEY_PATH ||
  process.env.EXPO_ASC_API_KEY_PATH ||
  path.join(MOBILE_ROOT, "credentials", "AuthKey_ASC.p8");

function parseListing(md) {
  const grab = (title) => {
    const re = new RegExp(`## ${title}[\\s\\S]*?\`\`\`\\n([\\s\\S]*?)\`\`\``);
    const m = md.match(re);
    return m ? m[1].trim() : "";
  };
  return {
    name: grab("Name \\(≤ 30\\)") || "Qwertymates",
    subtitle: grab("Subtitle \\(≤ 30\\)"),
    promotionalText: grab("Promotional text \\(≤ 170\\)"),
    description: grab("Description"),
    keywords: grab("Keywords \\(≤ 100 chars, comma-separated\\)"),
    supportUrl: grab("Support URL") || "https://www.qwertymates.com",
    marketingUrl: grab("Marketing URL") || "https://www.qwertymates.com",
    privacyUrl: "https://www.qwertymates.com/policies/privacy-policy"
  };
}

function makeJwt(issuer, kid, privateKeyPem) {
  const header = Buffer.from(
    JSON.stringify({ alg: "ES256", kid, typ: "JWT" })
  ).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: issuer,
      iat: now,
      exp: now + 20 * 60,
      aud: "appstoreconnect-v1"
    })
  ).toString("base64url");
  const data = `${header}.${payload}`;
  const sign = crypto.createSign("SHA256");
  sign.update(data);
  sign.end();
  const sig = sign.sign({ key: privateKeyPem, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${data}.${sig}`;
}

async function asc(token, method, urlPath, body) {
  const url = urlPath.startsWith("http")
    ? urlPath
    : `https://api.appstoreconnect.apple.com${urlPath}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`ASC ${method} ${urlPath} → ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function uploadBinary(uploadOperations, fileBuf) {
  for (const op of uploadOperations || []) {
    const headers = {};
    for (const h of op.requestHeaders || []) {
      // requestHeaders can be object map or array depending on API
    }
    if (Array.isArray(op.requestHeaders)) {
      for (const h of op.requestHeaders) {
        if (h && h.name) headers[h.name] = h.value;
      }
    } else if (op.requestHeaders && typeof op.requestHeaders === "object") {
      Object.assign(headers, op.requestHeaders);
    }
    const offset = Number(op.offset || 0);
    const length = Number(op.length || fileBuf.length);
    const chunk = fileBuf.subarray(offset, offset + length);
    const res = await fetch(op.url, {
      method: op.method || "PUT",
      headers,
      body: chunk
    });
    if (!res.ok) {
      throw new Error(`Upload part failed ${res.status} ${await res.text()}`);
    }
  }
}

/** Screenshot display types for ASC */
const DISPLAY_SETS = [
  {
    displayType: "APP_IPHONE_67",
    dir: path.join(GRAPHICS, "screenshots/iphone-6-7")
  },
  {
    displayType: "APP_IPHONE_65",
    dir: path.join(GRAPHICS, "screenshots/iphone-6-5")
  },
  {
    displayType: "APP_IPHONE_55",
    dir: path.join(GRAPHICS, "screenshots/iphone-5-5")
  },
  {
    displayType: "APP_IPAD_PRO_3GEN_129",
    dir: path.join(GRAPHICS, "screenshots/ipad-12-9")
  }
];

async function ensureScreenshotSet(token, localizationId, displayType) {
  const existing = await asc(
    token,
    "GET",
    `/v1/appStoreVersionLocalizations/${localizationId}/appScreenshotSets`
  );
  const found = (existing.data || []).find(
    (s) => s.attributes?.screenshotDisplayType === displayType
  );
  if (found) return found;
  const created = await asc(token, "POST", "/v1/appScreenshotSets", {
    data: {
      type: "appScreenshotSets",
      attributes: { screenshotDisplayType: displayType },
      relationships: {
        appStoreVersionLocalization: {
          data: { type: "appStoreVersionLocalizations", id: localizationId }
        }
      }
    }
  });
  return created.data;
}

async function clearScreenshots(token, setId) {
  const list = await asc(token, "GET", `/v1/appScreenshotSets/${setId}/appScreenshots`);
  for (const shot of list.data || []) {
    try {
      await asc(token, "DELETE", `/v1/appScreenshots/${shot.id}`);
    } catch (e) {
      console.warn("delete screenshot", shot.id, e.message);
    }
  }
}

async function uploadScreenshot(token, setId, filePath) {
  const buf = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const reserved = await asc(token, "POST", "/v1/appScreenshots", {
    data: {
      type: "appScreenshots",
      attributes: { fileName, fileSize: buf.length },
      relationships: {
        appScreenshotSet: { data: { type: "appScreenshotSets", id: setId } }
      }
    }
  });
  const shot = reserved.data;
  const ops = shot.attributes?.uploadOperations;
  await uploadBinary(ops, buf);
  await asc(token, "PATCH", `/v1/appScreenshots/${shot.id}`, {
    data: {
      type: "appScreenshots",
      id: shot.id,
      attributes: { uploaded: true }
    }
  });
  // poll
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await asc(token, "GET", `/v1/appScreenshots/${shot.id}`);
    const state = st.data?.attributes?.assetDeliveryState?.state;
    if (state === "COMPLETE") return;
    if (state === "FAILED") throw new Error(`Screenshot failed: ${fileName}`);
  }
  console.warn("Screenshot still processing:", fileName);
}

async function main() {
  if (!issuerId) {
    console.error(`
Missing ASC_ISSUER_ID.

The EAS-created key ID is ${keyId}, but the .p8 private key lives on EAS servers
and Issuer ID is on App Store Connect → Users and Access → Integrations → Keys.

1) Open https://appstoreconnect.apple.com/access/integrations/api
2) Note Issuer ID (UUID at top)
3) If you still have the .p8 download from key creation, save it as:
   mobile/credentials/AuthKey_ASC.p8
   (If not downloaded: create a NEW Team API key, download .p8 once, note Key ID)

Then:
  $env:ASC_ISSUER_ID="<uuid>"
  $env:ASC_KEY_ID="<key id>"
  $env:ASC_PRIVATE_KEY_PATH="credentials/AuthKey_ASC.p8"
  node scripts/ascFillListing.mjs --submit-review
`);
    process.exit(2);
  }
  if (!fs.existsSync(keyPath)) {
    console.error(`Private key not found: ${keyPath}`);
    process.exit(2);
  }
  if (!fs.existsSync(LISTING_MD)) {
    console.error(`Listing doc missing: ${LISTING_MD}`);
    process.exit(2);
  }

  const listing = parseListing(fs.readFileSync(LISTING_MD, "utf8"));
  const pem = fs.readFileSync(keyPath, "utf8");
  const token = makeJwt(issuerId, keyId, pem);

  console.log("ASC app", ASC_APP_ID, BUNDLE_ID);
  if (DRY) {
    console.log("DRY listing", listing);
    process.exit(0);
  }

  // Builds
  const builds = await asc(
    token,
    "GET",
    `/v1/builds?filter[app]=${ASC_APP_ID}&sort=-uploadedDate&limit=10&fields[builds]=version,uploadedDate,processingState,expired`
  );
  console.log(
    "Recent builds:",
    (builds.data || []).map((b) => ({
      id: b.id,
      version: b.attributes?.version,
      processing: b.attributes?.processingState,
      uploaded: b.attributes?.uploadedDate
    }))
  );
  // Apple uses PROCESSING / FAILED / INVALID / VALID
  const validBuild = WANT_BUILD_NUMBER
    ? (builds.data || []).find(
        (b) =>
          b.attributes?.processingState === "VALID" &&
          String(b.attributes?.version) === String(WANT_BUILD_NUMBER)
      )
    : (builds.data || []).find((b) => b.attributes?.processingState === "VALID");

  // App Store Versions
  const versions = await asc(
    token,
    "GET",
    `/v1/apps/${ASC_APP_ID}/appStoreVersions?filter[platform]=IOS&limit=20`
  );
  let version =
    (versions.data || []).find(
      (v) =>
        v.attributes?.versionString === VERSION_STRING &&
        ["PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW", "REJECTED", "METADATA_REJECTED", "DEVELOPER_REJECTED", "WAITING_FOR_REVIEW", "IN_REVIEW"].includes(
          v.attributes?.appStoreState
        )
    ) ||
    (versions.data || []).find((v) => v.attributes?.versionString === VERSION_STRING);

  if (!version) {
    console.log(`Creating appStoreVersion ${VERSION_STRING}…`);
    const created = await asc(token, "POST", "/v1/appStoreVersions", {
      data: {
        type: "appStoreVersions",
        attributes: {
          platform: "IOS",
          versionString: VERSION_STRING
        },
        relationships: {
          app: { data: { type: "apps", id: ASC_APP_ID } }
        }
      }
    });
    version = created.data;
  }
  console.log("Version", version.id, version.attributes);

  // Attach build
  if (validBuild) {
    console.log("Attaching build", validBuild.id, validBuild.attributes);
    try {
      await asc(token, "PATCH", `/v1/appStoreVersions/${version.id}`, {
        data: {
          type: "appStoreVersions",
          id: version.id,
          relationships: {
            build: { data: { type: "builds", id: validBuild.id } }
          }
        }
      });
      console.log("Build attached.");
    } catch (e) {
      console.warn("Attach build:", e.message, JSON.stringify(e.body)?.slice(0, 400));
    }
  } else {
    console.warn("No VALID build yet — Apple may still be processing. Re-run later.");
  }

  // Localization en-GB (ASC app Primary Language English U.K.)
  const locs = await asc(
    token,
    "GET",
    `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`
  );
  let loc =
    (locs.data || []).find((l) => l.attributes?.locale === "en-GB") ||
    (locs.data || []).find((l) => String(l.attributes?.locale).startsWith("en")) ||
    locs.data?.[0];
  if (!loc) {
    const created = await asc(token, "POST", "/v1/appStoreVersionLocalizations", {
      data: {
        type: "appStoreVersionLocalizations",
        attributes: {
          locale: "en-GB",
          description: listing.description,
          keywords: listing.keywords,
          supportUrl: listing.supportUrl,
          marketingUrl: listing.marketingUrl,
          promotionalText: listing.promotionalText
        },
        relationships: {
          appStoreVersion: { data: { type: "appStoreVersions", id: version.id } }
        }
      }
    });
    loc = created.data;
  } else {
    const locAttrs = {
      description: listing.description,
      keywords: listing.keywords,
      supportUrl: listing.supportUrl,
      marketingUrl: listing.marketingUrl,
      promotionalText: listing.promotionalText
    };
    if (VERSION_STRING !== "1.0") {
      locAttrs.whatsNew =
        "QwertyMedia hub (TV, Music, Podcasts), Morongwa Chat with voice and video calls, wallet Send Money and Request Money, scroll-aware navigation, MyStore quick access, and performance improvements.";
    }
    try {
      await asc(token, "PATCH", `/v1/appStoreVersionLocalizations/${loc.id}`, {
        data: {
          type: "appStoreVersionLocalizations",
          id: loc.id,
          attributes: locAttrs
        }
      });
    } catch (e) {
      if (e.status === 409) {
        console.warn("Localization PATCH 409 — retrying without promotionalText");
        delete locAttrs.promotionalText;
        await asc(token, "PATCH", `/v1/appStoreVersionLocalizations/${loc.id}`, {
          data: {
            type: "appStoreVersionLocalizations",
            id: loc.id,
            attributes: locAttrs
          }
        });
      } else {
        throw e;
      }
    }
  }
  console.log("Localization updated", loc.id);

  // App info / subtitle via appInfo localizations is separate in newer API
  try {
    const infos = await asc(token, "GET", `/v1/apps/${ASC_APP_ID}/appInfos`);
    const info = infos.data?.[0];
    if (info) {
      const infoLocs = await asc(token, "GET", `/v1/appInfos/${info.id}/appInfoLocalizations`);
      const infoLoc =
        (infoLocs.data || []).find((l) => l.attributes?.locale === "en-GB") ||
        infoLocs.data?.[0];
      if (infoLoc) {
        await asc(token, "PATCH", `/v1/appInfoLocalizations/${infoLoc.id}`, {
          data: {
            type: "appInfoLocalizations",
            id: infoLoc.id,
            attributes: {
              name: listing.name,
              subtitle: listing.subtitle,
              privacyPolicyUrl: listing.privacyUrl
            }
          }
        });
        console.log("App info localization updated (name/subtitle/privacy).");
      }
    }
  } catch (e) {
    console.warn("appInfo localization:", e.message);
  }

  // Screenshots
  for (const set of DISPLAY_SETS) {
    if (!fs.existsSync(set.dir)) {
      console.warn("Missing dir", set.dir);
      continue;
    }
    const files = fs
      .readdirSync(set.dir)
      .filter((f) => /\.(jpg|jpeg|png)$/i.test(f))
      .sort()
      .slice(0, 5);
    console.log(`Screenshots ${set.displayType}:`, files.length);
    const shotSet = await ensureScreenshotSet(token, loc.id, set.displayType);
    await clearScreenshots(token, shotSet.id);
    for (const f of files) {
      const fp = path.join(set.dir, f);
      process.stdout.write(`  upload ${f}… `);
      try {
        await uploadScreenshot(token, shotSet.id, fp);
        console.log("ok");
      } catch (e) {
        console.log("FAIL", e.message);
      }
    }
  }

  console.log(`
Done with metadata + screenshots where possible.

Still typically MANUAL in ASC (limited/no API):
  - Age Rating questionnaire
  - App Privacy nutrition labels (detailed)
  - Content rights / export compliance answers if prompted
  - Final "Add for Review" may need review notes / contact

Privacy URL set: ${listing.privacyUrl}
Support URL set: ${listing.supportUrl}
`);

  if (WANT_SUBMIT) {
    try {
      // Create review submission if API available
      const sub = await asc(token, "POST", "/v1/reviewSubmissions", {
        data: {
          type: "reviewSubmissions",
          attributes: { platform: "IOS" },
          relationships: {
            app: { data: { type: "apps", id: ASC_APP_ID } }
          }
        }
      });
      console.log("reviewSubmissions created", sub.data?.id);
      await asc(token, "POST", "/v1/reviewSubmissionItems", {
        data: {
          type: "reviewSubmissionItems",
          relationships: {
            reviewSubmission: { data: { type: "reviewSubmissions", id: sub.data.id } },
            appStoreVersion: { data: { type: "appStoreVersions", id: version.id } }
          }
        }
      });
      await asc(token, "PATCH", `/v1/reviewSubmissions/${sub.data.id}`, {
        data: {
          type: "reviewSubmissions",
          id: sub.data.id,
          attributes: { submitted: true }
        }
      });
      console.log("Submitted for review via API.");
    } catch (e) {
      console.warn(
        "Auto submit-for-review failed (often needs age rating + privacy first):",
        e.message,
        JSON.stringify(e.body)?.slice(0, 500)
      );
    }
  }
}

main().catch((e) => {
  console.error(e.message);
  if (e.body) console.error(JSON.stringify(e.body, null, 2).slice(0, 2000));
  process.exit(1);
});
