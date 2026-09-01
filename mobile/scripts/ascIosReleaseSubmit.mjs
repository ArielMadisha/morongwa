/**
 * Wait for ASC build VALID, create version, fill listing, submit for review.
 * Usage: node scripts/ascIosReleaseSubmit.mjs --version-string 1.3.38 --build-number 11
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(__dirname, "..");
const ASC_APP_ID = "6798004708";

const args = process.argv.slice(2);
function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

const VERSION_STRING = argVal("--version-string") || "1.3.38";
const BUILD_NUMBER = argVal("--build-number") || "11";
const MAX_WAIT_MIN = Number(argVal("--max-wait-min") || "20");

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const list = await gql(
  `query($accountName: String!) {
    account { byName(accountName: $accountName) {
      appStoreConnectApiKeysPaginated(first: 1) { edges { node { id } } }
    }}
  }`,
  { accountName: "qwertymates" }
);
const keyId = list.account.byName.appStoreConnectApiKeysPaginated.edges[0].node.id;
const full = await gql(
  `query($id: ID!) { appStoreConnectApiKey { byId(id: $id) { issuerIdentifier keyIdentifier keyP8 } } }`,
  { id: keyId }
);
const key = full.appStoreConnectApiKey.byId;
const token = jwt(key.issuerIdentifier, key.keyIdentifier, key.keyP8);

const before = {
  versions: (
    await asc(token, "GET", `/v1/apps/${ASC_APP_ID}/appStoreVersions?filter[platform]=IOS&limit=10`)
  ).data?.map((v) => ({
    id: v.id,
    versionString: v.attributes?.versionString,
    appStoreState: v.attributes?.appStoreState
  })),
  builds: (
    await asc(
      token,
      "GET",
      `/v1/builds?filter[app]=${ASC_APP_ID}&sort=-uploadedDate&limit=5&fields[builds]=version,uploadedDate,processingState`
    )
  ).data?.map((b) => ({
    id: b.id,
    buildNumber: b.attributes?.version,
    processingState: b.attributes?.processingState
  }))
};

console.log("BEFORE", JSON.stringify(before, null, 2));

let validBuild = null;
const deadline = Date.now() + MAX_WAIT_MIN * 60_000;
while (Date.now() < deadline) {
  const builds = await asc(
    token,
    "GET",
    `/v1/builds?filter[app]=${ASC_APP_ID}&sort=-uploadedDate&limit=10&fields[builds]=version,uploadedDate,processingState`
  );
  const row = (builds.data || []).find(
    (b) => String(b.attributes?.version) === String(BUILD_NUMBER)
  );
  if (row) {
    console.log(`Build ${BUILD_NUMBER}: ${row.attributes?.processingState}`);
    if (row.attributes?.processingState === "VALID") {
      validBuild = row;
      break;
    }
  } else {
    console.log(`Build ${BUILD_NUMBER} not visible yet…`);
  }
  await sleep(30_000);
}

if (!validBuild) {
  console.error(`Build ${BUILD_NUMBER} not VALID within ${MAX_WAIT_MIN} min`);
  process.exit(3);
}

// Fill listing + attach + submit via ascFillListing
const fill = spawnSync(
  process.execPath,
  [
    path.join(MOBILE, "scripts", "easPullAscKeyAndFillListing.mjs"),
    "--version-string",
    VERSION_STRING,
    "--build-number",
    BUILD_NUMBER,
    "--submit-review"
  ],
  { cwd: MOBILE, stdio: "inherit", env: process.env }
);
if (fill.status !== 0) {
  console.error("ascFillListing failed", fill.status);
  process.exit(fill.status || 1);
}

// Set review notes for iOS compliance on new version
const versions = await asc(
  token,
  "GET",
  `/v1/apps/${ASC_APP_ID}/appStoreVersions?filter[platform]=IOS&limit=10`
);
const version = (versions.data || []).find((v) => v.attributes?.versionString === VERSION_STRING);
if (version) {
  try {
    let detail;
    try {
      detail = await asc(token, "GET", `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`);
    } catch {
      detail = null;
    }
    const notes = `Qwertymates ${VERSION_STRING} (${BUILD_NUMBER}) — feature update aligned with Android 1.3.37.

iOS App Review compliance (unchanged from accepted 1.0):
• Guideline 3.1.1: Creator digital tips / Buy me Coffee / school Donate are hidden on iOS (iosStoreCompliance.ts). P2P wallet Scan-QR send remains.
• Guideline 5.2.3: Facebook-ingested and third-party AV (YouTube/Spotify/SoundCloud) filtered from QwertyTV, status strip, and QwertyMusic on iOS.
• Tracking: No IDFA; usesIdfa=false; no ATT prompt.
• Screenshots: iOS device chrome only; wallet captions use "ACBPay Wallet".

App access: Sign Up with any email. No demo account required. API: https://api.qwertymates.com. Support: administrator@qwertymates.com.`;
    const attrs = {
      contactFirstName: "Ariel",
      contactLastName: "Madisha",
      contactEmail: "administrator@qwertymates.com",
      contactPhone: "+27815826899",
      demoAccountRequired: false,
      notes
    };
    if (detail?.data?.id) {
      await asc(token, "PATCH", `/v1/appStoreReviewDetails/${detail.data.id}`, {
        data: { type: "appStoreReviewDetails", id: detail.data.id, attributes: attrs }
      });
    } else {
      await asc(token, "POST", "/v1/appStoreReviewDetails", {
        data: {
          type: "appStoreReviewDetails",
          attributes: attrs,
          relationships: {
            appStoreVersion: { data: { type: "appStoreVersions", id: version.id } }
          }
        }
      });
    }
    console.log("Review notes updated (demoAccountRequired=false).");
  } catch (e) {
    console.warn("Review notes:", e.message);
  }
}

const subs = await asc(
  token,
  "GET",
  `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=5`
);
const afterVersion = version
  ? await asc(token, "GET", `/v1/appStoreVersions/${version.id}`)
  : null;

const out = {
  fetchedAt: new Date().toISOString(),
  marketingVersion: VERSION_STRING,
  buildNumber: BUILD_NUMBER,
  buildId: validBuild.id,
  versionState: afterVersion?.data?.attributes?.appStoreState,
  usesIdfa: afterVersion?.data?.attributes?.usesIdfa,
  submissions: (subs.data || []).map((s) => ({
    id: s.id,
    state: s.attributes?.state,
    submittedDate: s.attributes?.submittedDate
  })),
  ascUrl: `https://appstoreconnect.apple.com/apps/${ASC_APP_ID}/appstore/ios/version/inflight`
};

console.log("AFTER", JSON.stringify(out, null, 2));
fs.mkdirSync(path.join(MOBILE, "exports"), { recursive: true });
fs.writeFileSync(
  path.join(MOBILE, "exports", "asc-ios-138-release-result.json"),
  JSON.stringify({ before, after: out }, null, 2)
);

const waiting = (subs.data || []).some((s) =>
  ["WAITING_FOR_REVIEW", "IN_REVIEW", "READY_FOR_REVIEW"].includes(s.attributes?.state)
);
process.exit(waiting || out.versionState === "WAITING_FOR_REVIEW" ? 0 : 2);
