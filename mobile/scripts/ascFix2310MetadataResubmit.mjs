/**
 * Fix Guideline 2.3.10 Accurate Metadata for Qwertymates iOS 1.0, then resubmit.
 *
 * - Inventory version / submissions / screenshot sets
 * - Upload corrected screenshots from App Stores Graphics pack
 * - Update en-GB listing copy (ACBPay Wallet spaced branding)
 * - Update review notes explaining 2.3.10 fix
 * - Create/submit reviewSubmission (reuse build if still attached)
 *
 * From mobile/:
 *   node scripts/ascFix2310MetadataResubmit.mjs
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(__dirname, "..");
const VERSION_ID = "b1ec529b-acc3-4935-b109-8ae6cb94d645";
const ASC_APP_ID = "6798004708";
const GRAPHICS = path.resolve(
  MOBILE_ROOT,
  "../../App Stores Graphics/IOS/Qwertymates"
);
const NOTES_FILE = path.join(MOBILE_ROOT, "exports", "ios-review-notes-2310-fix.txt");
const OUT_FILE = path.join(MOBILE_ROOT, "exports", "asc-2310-fix-result.json");

const DISPLAY_SETS = [
  { displayType: "APP_IPHONE_67", dir: path.join(GRAPHICS, "screenshots/iphone-6-7") },
  { displayType: "APP_IPHONE_65", dir: path.join(GRAPHICS, "screenshots/iphone-6-5") },
  { displayType: "APP_IPHONE_55", dir: path.join(GRAPHICS, "screenshots/iphone-5-5") },
  { displayType: "APP_IPAD_PRO_3GEN_129", dir: path.join(GRAPHICS, "screenshots/ipad-12-9") }
];

const LISTING = {
  promotionalText:
    "Post on your Wall, shop QwertyHub, watch QwertyTV, and pay with ACBPay Wallet.",
  description: `Qwertymates is the digital home for doers, sellers and creators — post on your Wall, shop on QwertyHub, watch QwertyTV, explore QwertyWorld, play QwertyMusic, and pay with ACBPay Wallet.

YOUR WALL
• Share posts and statuses with a circular Create control
• Full-bleed images and videos
• Like, comment and share

SHOP & EARN
• Browse QwertyHub products and local stores
• Checkout with prepaid delivery when required

WATCH & EXPLORE
• QwertyTV for video posts
• QwertyWorld discovery
• QwertyMusic for audio

PAY WITH ACBPAY WALLET
• In-app wallet to top up and manage activity (ACBPay Wallet)
• Person-to-person send money and pay for physical goods

Support: support@qwertymates.com
Web: https://www.qwertymates.com`,
  keywords: "social,marketplace,video,wallet,africa,qwertyhub,qwertytv",
  supportUrl: "https://www.qwertymates.com",
  marketingUrl: "https://www.qwertymates.com"
};

const state = JSON.parse(
  fs.readFileSync(path.join(process.env.USERPROFILE, ".expo", "state.json"), "utf8")
);

async function gql(query, variables = {}) {
  const res = await fetch("https://api.expo.dev/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "expo-session": state.auth.sessionSecret
    },
    body: JSON.stringify({ query, variables })
  });
  const j = await res.json();
  if (j.errors?.length) throw new Error(j.errors.map((e) => e.message).join("; "));
  return j.data;
}

function jwt(issuer, kid, pem) {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid, typ: "JWT" })).toString(
    "base64url"
  );
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ iss: issuer, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" })
  ).toString("base64url");
  const data = `${header}.${payload}`;
  const sign = crypto.createSign("SHA256");
  sign.update(data);
  sign.end();
  return `${data}.${sign.sign({ key: pem, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

async function asc(token, method, urlPath, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`${method} ${urlPath} ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function tryAsc(token, method, urlPath, body) {
  try {
    return { ok: true, json: await asc(token, method, urlPath, body) };
  } catch (e) {
    return { ok: false, status: e.status, body: e.body, message: e.message };
  }
}

async function uploadBinary(uploadOperations, fileBuf) {
  for (const op of uploadOperations || []) {
    const headers = {};
    if (Array.isArray(op.requestHeaders)) {
      for (const h of op.requestHeaders) {
        if (h?.name) headers[h.name] = h.value;
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
    if (!res.ok) throw new Error(`Upload part failed ${res.status} ${await res.text()}`);
  }
}

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
  await uploadBinary(shot.attributes?.uploadOperations, buf);
  await asc(token, "PATCH", `/v1/appScreenshots/${shot.id}`, {
    data: {
      type: "appScreenshots",
      id: shot.id,
      attributes: { uploaded: true }
    }
  });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await asc(token, "GET", `/v1/appScreenshots/${shot.id}`);
    const stateName = st.data?.attributes?.assetDeliveryState?.state;
    if (stateName === "COMPLETE") return;
    if (stateName === "FAILED") throw new Error(`Screenshot failed: ${fileName}`);
  }
  console.warn("Screenshot still processing:", fileName);
}

const list = await gql(
  `query($accountName: String!) {
    account {
      byName(accountName: $accountName) {
        appStoreConnectApiKeysPaginated(first: 1) {
          edges { node { id } }
        }
      }
    }
  }`,
  { accountName: "qwertymates" }
);
const keyId = list.account.byName.appStoreConnectApiKeysPaginated.edges[0].node.id;
const full = await gql(
  `query($id: ID!) {
    appStoreConnectApiKey {
      byId(id: $id) { issuerIdentifier keyIdentifier keyP8 }
    }
  }`,
  { id: keyId }
);
const key = full.appStoreConnectApiKey.byId;
const token = jwt(key.issuerIdentifier, key.keyIdentifier, key.keyP8);

const result = {
  fetchedAt: new Date().toISOString(),
  before: {},
  screenshotsUploaded: [],
  listingUpdated: false,
  notesUpdated: false,
  submitted: false,
  submissionId: null,
  after: {},
  gaps: []
};

// --- Inventory ---
const ver = await asc(
  token,
  "GET",
  `/v1/appStoreVersions/${VERSION_ID}?include=build,appStoreVersionSubmission,appStoreReviewDetail`
);
result.before.versionState = ver.data.attributes?.appStoreState;
result.before.versionString = ver.data.attributes?.versionString;
result.before.buildId = ver.data.relationships?.build?.data?.id || null;
const buildInc = (ver.included || []).find((i) => i.type === "builds");
result.before.buildNumber = buildInc?.attributes?.version || null;
result.before.buildProcessing = buildInc?.attributes?.processingState || null;

const subs = await asc(
  token,
  "GET",
  `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=8`
);
result.before.submissions = (subs.data || []).map((s) => ({
  id: s.id,
  state: s.attributes?.state,
  submittedDate: s.attributes?.submittedDate
}));

const locs = await asc(
  token,
  "GET",
  `/v1/appStoreVersions/${VERSION_ID}/appStoreVersionLocalizations`
);
const loc =
  (locs.data || []).find((l) => l.attributes?.locale === "en-GB") ||
  (locs.data || []).find((l) => String(l.attributes?.locale).startsWith("en")) ||
  locs.data?.[0];
if (!loc) throw new Error("No appStoreVersionLocalization found");
result.before.locale = loc.attributes?.locale;
result.before.localizationId = loc.id;

const inventory = [];
const sets = await asc(
  token,
  "GET",
  `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`
);
for (const set of sets.data || []) {
  const shots = await asc(token, "GET", `/v1/appScreenshotSets/${set.id}/appScreenshots`);
  inventory.push({
    setId: set.id,
    displayType: set.attributes?.screenshotDisplayType,
    files: (shots.data || []).map((s) => ({
      id: s.id,
      fileName: s.attributes?.fileName,
      state: s.attributes?.assetDeliveryState?.state,
      size: s.attributes?.imageAsset
        ? `${s.attributes.imageAsset.width}x${s.attributes.imageAsset.height}`
        : null
    }))
  });
}
result.before.screenshotSets = inventory;
console.log(
  "BEFORE",
  JSON.stringify(
    {
      state: result.before.versionState,
      build: result.before.buildNumber,
      subs: result.before.submissions,
      shots: inventory.map((s) => `${s.displayType}:${s.files.length}`)
    },
    null,
    2
  )
);

if (result.before.versionState !== "REJECTED" && result.before.versionState !== "METADATA_REJECTED") {
  console.warn("Unexpected version state:", result.before.versionState);
}

// --- Update listing ---
const locPatch = await tryAsc(token, "PATCH", `/v1/appStoreVersionLocalizations/${loc.id}`, {
  data: {
    type: "appStoreVersionLocalizations",
    id: loc.id,
    attributes: {
      description: LISTING.description,
      keywords: LISTING.keywords,
      supportUrl: LISTING.supportUrl,
      marketingUrl: LISTING.marketingUrl,
      promotionalText: LISTING.promotionalText
    }
  }
});
if (!locPatch.ok && locPatch.status === 409) {
  const retry = await tryAsc(token, "PATCH", `/v1/appStoreVersionLocalizations/${loc.id}`, {
    data: {
      type: "appStoreVersionLocalizations",
      id: loc.id,
      attributes: {
        description: LISTING.description,
        keywords: LISTING.keywords,
        supportUrl: LISTING.supportUrl,
        marketingUrl: LISTING.marketingUrl
      }
    }
  });
  result.listingUpdated = retry.ok;
  if (!retry.ok) console.warn("listing patch failed", retry.status, JSON.stringify(retry.body)?.slice(0, 400));
} else {
  result.listingUpdated = locPatch.ok;
  if (!locPatch.ok) console.warn("listing patch failed", locPatch.status, JSON.stringify(locPatch.body)?.slice(0, 400));
}
console.log("listingUpdated", result.listingUpdated);

// --- Screenshots ---
for (const set of DISPLAY_SETS) {
  if (!fs.existsSync(set.dir)) {
    result.gaps.push(`Missing screenshot dir: ${set.dir}`);
    console.warn("Missing dir", set.dir);
    continue;
  }
  const files = fs
    .readdirSync(set.dir)
    .filter((f) => /\.(jpg|jpeg|png)$/i.test(f))
    .sort()
    .slice(0, 5);
  if (!files.length) {
    result.gaps.push(`Empty screenshot dir: ${set.dir}`);
    continue;
  }
  const shotSet = await ensureScreenshotSet(token, loc.id, set.displayType);
  await clearScreenshots(token, shotSet.id);
  for (const f of files) {
    const fp = path.join(set.dir, f);
    process.stdout.write(`upload ${set.displayType} ${f}… `);
    try {
      await uploadScreenshot(token, shotSet.id, fp);
      console.log("ok");
      result.screenshotsUploaded.push({ displayType: set.displayType, file: f, ok: true });
    } catch (e) {
      console.log("FAIL", e.message);
      result.screenshotsUploaded.push({
        displayType: set.displayType,
        file: f,
        ok: false,
        error: e.message
      });
      result.gaps.push(`${set.displayType}/${f}: ${e.message}`);
    }
  }
}

// --- Review notes ---
const notes = fs.readFileSync(NOTES_FILE, "utf8").trim();
if (notes.length > 4000) throw new Error(`Review notes too long: ${notes.length}`);
const detail = await tryAsc(
  token,
  "GET",
  `/v1/appStoreVersions/${VERSION_ID}/appStoreReviewDetail`
);
const noteAttrs = {
  contactFirstName: "Ariel",
  contactLastName: "Madisha",
  contactEmail: "administrator@qwertymates.com",
  contactPhone: "+27815826899",
  demoAccountRequired: false,
  notes
};
if (detail.ok && detail.json?.data?.id) {
  const patched = await tryAsc(
    token,
    "PATCH",
    `/v1/appStoreReviewDetails/${detail.json.data.id}`,
    {
      data: {
        type: "appStoreReviewDetails",
        id: detail.json.data.id,
        attributes: noteAttrs
      }
    }
  );
  result.notesUpdated = patched.ok;
  if (!patched.ok) console.warn("notes patch", patched.status, JSON.stringify(patched.body)?.slice(0, 400));
} else {
  const created = await tryAsc(token, "POST", "/v1/appStoreReviewDetails", {
    data: {
      type: "appStoreReviewDetails",
      attributes: noteAttrs,
      relationships: {
        appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
      }
    }
  });
  result.notesUpdated = created.ok;
  if (!created.ok) console.warn("notes create", created.status, JSON.stringify(created.body)?.slice(0, 400));
}
console.log("notesUpdated", result.notesUpdated);

// Confirm build still attached
if (!result.before.buildId) {
  result.gaps.push("No build attached — cannot submit until a VALID build is linked");
} else {
  // Prefer existing open submission or create new
  let subId =
    (result.before.submissions || []).find((s) =>
      ["READY_FOR_REVIEW", "UNRESOLVED"].includes(s.state)
    )?.id || null;

  if (!subId) {
    const created = await tryAsc(token, "POST", "/v1/reviewSubmissions", {
      data: {
        type: "reviewSubmissions",
        attributes: { platform: "IOS" },
        relationships: {
          app: { data: { type: "apps", id: ASC_APP_ID } }
        }
      }
    });
    console.log(
      "create submission",
      created.ok,
      created.status || 200,
      JSON.stringify(created.body || created.json)?.slice(0, 500)
    );
    subId = created.json?.data?.id || null;
  }

  if (subId) {
    result.submissionId = subId;
    const item = await tryAsc(token, "POST", "/v1/reviewSubmissionItems", {
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: { data: { type: "reviewSubmissions", id: subId } },
          appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
        }
      }
    });
    console.log(
      "add item",
      item.ok,
      item.status || 200,
      JSON.stringify(item.body || item.json)?.slice(0, 500)
    );

    const submit = await tryAsc(token, "PATCH", `/v1/reviewSubmissions/${subId}`, {
      data: {
        type: "reviewSubmissions",
        id: subId,
        attributes: { submitted: true }
      }
    });
    console.log(
      "submit",
      submit.ok,
      submit.status || 200,
      JSON.stringify(submit.body || { state: submit.json?.data?.attributes?.state })?.slice(0, 800)
    );
    result.submitted = submit.ok;
    if (!submit.ok) {
      result.gaps.push(
        `Submit failed: ${submit.status} ${JSON.stringify(submit.body)?.slice(0, 300)}`
      );
    }
  } else {
    result.gaps.push("Could not create or find reviewSubmission");
  }
}

const ver2 = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
const subs2 = await asc(
  token,
  "GET",
  `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=5`
);
result.after.versionState = ver2.data.attributes?.appStoreState;
result.after.submissions = (subs2.data || []).map((s) => ({
  id: s.id,
  state: s.attributes?.state,
  submittedDate: s.attributes?.submittedDate
}));

fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
console.log("FINAL", JSON.stringify(result, null, 2));
console.log("ASC:", `https://appstoreconnect.apple.com/apps/${ASC_APP_ID}/appstore`);
