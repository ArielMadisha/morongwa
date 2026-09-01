/**
 * Guideline 2.3.10 — inventory, replace screenshots (no Android status bars),
 * update review notes, resubmit Qwertymates iOS (app 6798004708).
 *
 * From mobile/:
 *   node scripts/ascFixScreenshot2310.mjs
 *   node scripts/ascFixScreenshot2310.mjs --inventory-only
 *   node scripts/ascFixScreenshot2310.mjs --skip-submit
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(__dirname, "..");
const GRAPHICS = path.resolve(
  MOBILE_ROOT,
  "../../App Stores Graphics/IOS/Qwertymates"
);
const ASC_APP_ID = "6798004708";
const VERSION_ID = "b1ec529b-acc3-4935-b109-8ae6cb94d645";
const NOTES_FILE = path.join(MOBILE_ROOT, "exports", "ios-review-notes-2310-fix.txt");
const OUT_JSON = path.join(MOBILE_ROOT, "exports", "asc-screenshot-2310-result.json");

const args = process.argv.slice(2);
const INVENTORY_ONLY = args.includes("--inventory-only");
const SKIP_SUBMIT = args.includes("--skip-submit");

const DISPLAY_SETS = [
  { displayType: "APP_IPHONE_67", dir: path.join(GRAPHICS, "screenshots/iphone-6-7") },
  { displayType: "APP_IPHONE_65", dir: path.join(GRAPHICS, "screenshots/iphone-6-5") },
  { displayType: "APP_IPHONE_55", dir: path.join(GRAPHICS, "screenshots/iphone-5-5") },
  { displayType: "APP_IPAD_PRO_3GEN_129", dir: path.join(GRAPHICS, "screenshots/ipad-12-9") }
];

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

async function getToken() {
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
  return jwt(key.issuerIdentifier, key.keyIdentifier, key.keyP8);
}

async function uploadBinary(uploadOperations, fileBuf) {
  for (const op of uploadOperations || []) {
    const headers = {};
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
  let deleted = 0;
  for (const shot of list.data || []) {
    try {
      await asc(token, "DELETE", `/v1/appScreenshots/${shot.id}`);
      deleted += 1;
    } catch (e) {
      console.warn("delete screenshot", shot.id, e.message);
    }
  }
  return deleted;
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
    if (stateName === "COMPLETE") return { id: shot.id, fileName, state: stateName };
    if (stateName === "FAILED") {
      throw new Error(`Screenshot failed: ${fileName} ${JSON.stringify(st.data?.attributes?.assetDeliveryState)}`);
    }
  }
  return { id: shot.id, fileName, state: "PROCESSING_TIMEOUT" };
}

async function inventory(token, localizationId) {
  const sets = await asc(
    token,
    "GET",
    `/v1/appStoreVersionLocalizations/${localizationId}/appScreenshotSets`
  );
  const out = [];
  for (const s of sets.data || []) {
    const shots = await asc(token, "GET", `/v1/appScreenshotSets/${s.id}/appScreenshots`);
    out.push({
      setId: s.id,
      displayType: s.attributes?.screenshotDisplayType,
      count: (shots.data || []).length,
      screenshots: (shots.data || []).map((sh) => ({
        id: sh.id,
        fileName: sh.attributes?.fileName,
        fileSize: sh.attributes?.fileSize,
        state: sh.attributes?.assetDeliveryState?.state,
        width: sh.attributes?.imageAsset?.width,
        height: sh.attributes?.imageAsset?.height
      }))
    });
  }
  return out;
}

async function updateReviewNotes(token) {
  const notes = fs.readFileSync(NOTES_FILE, "utf8").trim();
  if (notes.length > 4000) throw new Error(`Review notes too long: ${notes.length}`);
  const attrs = {
    contactFirstName: "Ariel",
    contactLastName: "Madisha",
    contactEmail: "administrator@qwertymates.com",
    contactPhone: "+27815826899",
    demoAccountRequired: false,
    demoAccountName: "",
    demoAccountPassword: "",
    notes
  };
  let detail;
  try {
    detail = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}/appStoreReviewDetail`);
  } catch {
    detail = null;
  }
  if (detail?.data?.id) {
    await asc(token, "PATCH", `/v1/appStoreReviewDetails/${detail.data.id}`, {
      data: { type: "appStoreReviewDetails", id: detail.data.id, attributes: attrs }
    });
    return { action: "patched", id: detail.data.id, chars: notes.length };
  }
  const created = await asc(token, "POST", "/v1/appStoreReviewDetails", {
    data: {
      type: "appStoreReviewDetails",
      attributes: attrs,
      relationships: {
        appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
      }
    }
  });
  return { action: "created", id: created.data?.id, chars: notes.length };
}

async function resubmit(token) {
  const result = { cancelled: [], created: null, submitted: false, errors: [] };

  const subs = await asc(
    token,
    "GET",
    `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=10`
  );
  for (const s of subs.data || []) {
    const st = s.attributes?.state;
    if (st === "UNRESOLVED_ISSUES" || st === "WAITING_FOR_REVIEW" || st === "IN_REVIEW") {
      const cancel = await tryAsc(token, "PATCH", `/v1/reviewSubmissions/${s.id}`, {
        data: {
          type: "reviewSubmissions",
          id: s.id,
          attributes: { canceled: true }
        }
      });
      result.cancelled.push({ id: s.id, state: st, ok: cancel.ok, err: cancel.message });
    }
  }

  // Soft wait so version can return to editable / READY_FOR_REVIEW
  for (let i = 0; i < 12; i++) {
    const ver = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
    const stateName = ver.data?.attributes?.appStoreState;
    console.log("version state", stateName);
    if (
      ["READY_FOR_REVIEW", "PREPARE_FOR_SUBMISSION", "REJECTED", "METADATA_REJECTED", "DEVELOPER_REJECTED"].includes(
        stateName
      )
    ) {
      break;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  const created = await tryAsc(token, "POST", "/v1/reviewSubmissions", {
    data: {
      type: "reviewSubmissions",
      attributes: { platform: "IOS" },
      relationships: {
        app: { data: { type: "apps", id: ASC_APP_ID } }
      }
    }
  });
  if (!created.ok) {
    result.errors.push({ step: "createSubmission", ...created });
    return result;
  }
  result.created = created.json.data?.id;

  const item = await tryAsc(token, "POST", "/v1/reviewSubmissionItems", {
    data: {
      type: "reviewSubmissionItems",
      relationships: {
        reviewSubmission: { data: { type: "reviewSubmissions", id: result.created } },
        appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
      }
    }
  });
  if (!item.ok) {
    result.errors.push({ step: "addItem", ...item });
    return result;
  }

  const submit = await tryAsc(token, "PATCH", `/v1/reviewSubmissions/${result.created}`, {
    data: {
      type: "reviewSubmissions",
      id: result.created,
      attributes: { submitted: true }
    }
  });
  if (!submit.ok) {
    result.errors.push({ step: "submit", ...submit });
    return result;
  }
  result.submitted = true;
  result.submitState = submit.json.data?.attributes?.state;
  return result;
}

async function main() {
  const token = await getToken();
  const ver = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
  console.log("VERSION", {
    id: ver.data.id,
    state: ver.data.attributes?.appStoreState,
    version: ver.data.attributes?.versionString
  });

  const locs = await asc(
    token,
    "GET",
    `/v1/appStoreVersions/${VERSION_ID}/appStoreVersionLocalizations`
  );
  const loc =
    (locs.data || []).find((l) => l.attributes?.locale === "en-GB") ||
    (locs.data || []).find((l) => String(l.attributes?.locale).startsWith("en")) ||
    locs.data?.[0];
  if (!loc) throw new Error("No localization found");
  console.log("LOCALE", loc.id, loc.attributes?.locale);

  const before = await inventory(token, loc.id);
  console.log(
    "INVENTORY BEFORE",
    before.map((s) => `${s.displayType}:${s.count}`).join(", ")
  );

  const result = {
    fetchedAt: new Date().toISOString(),
    version: {
      id: ver.data.id,
      state: ver.data.attributes?.appStoreState,
      versionString: ver.data.attributes?.versionString
    },
    localizationId: loc.id,
    locale: loc.attributes?.locale,
    inventoryBefore: before,
    replaced: [],
    replacedCount: 0,
    reviewNotes: null,
    submit: null,
    inventoryAfter: null
  };

  if (INVENTORY_ONLY) {
    fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));
    console.log("Wrote", OUT_JSON);
    return;
  }

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
    const shotSet = await ensureScreenshotSet(token, loc.id, set.displayType);
    const deleted = await clearScreenshots(token, shotSet.id);
    console.log(`Replace ${set.displayType}: deleted ${deleted}, upload ${files.length}`);
    for (const f of files) {
      const fp = path.join(set.dir, f);
      process.stdout.write(`  upload ${f}… `);
      try {
        const up = await uploadScreenshot(token, shotSet.id, fp);
        console.log(up.state);
        result.replaced.push({ displayType: set.displayType, ...up });
        result.replacedCount += 1;
      } catch (e) {
        console.log("FAIL", e.message);
        result.replaced.push({
          displayType: set.displayType,
          fileName: f,
          error: e.message,
          body: e.body
        });
      }
    }
  }

  result.reviewNotes = await updateReviewNotes(token);
  console.log("Review notes", result.reviewNotes);

  if (!SKIP_SUBMIT) {
    result.submit = await resubmit(token);
    console.log("Submit", JSON.stringify(result.submit, null, 2));
  } else {
    result.submit = { skipped: true };
  }

  result.inventoryAfter = await inventory(token, loc.id);
  const verAfter = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
  result.versionAfter = {
    id: verAfter.data.id,
    state: verAfter.data.attributes?.appStoreState,
    versionString: verAfter.data.attributes?.versionString
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));
  console.log("Wrote", OUT_JSON);
  console.log("REPLACED_COUNT", result.replacedCount);
  console.log("SUBMITTED", Boolean(result.submit?.submitted), result.submit?.created || "");
}

main().catch((e) => {
  console.error(e.message);
  if (e.body) console.error(JSON.stringify(e.body, null, 2).slice(0, 2500));
  process.exit(1);
});
