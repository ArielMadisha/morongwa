/**
 * Update App Store Connect review notes for Guideline 3.1.1 + 5.2.3 resubmit.
 *
 * Usage (from mobile/):
 *   node scripts/ascUpdateGuidelineFixNotes.mjs
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(__dirname, "..");
const VERSION_ID = "b1ec529b-acc3-4935-b109-8ae6cb94d645";
const ASC_APP_ID = "6798004708";
const NOTES_FILE = path.join(MOBILE_ROOT, "exports", "ios-review-notes-guideline-fix.txt");

const notes = fs.readFileSync(NOTES_FILE, "utf8").trim();
if (notes.length > 4000) {
  console.error(`Review notes too long: ${notes.length} (max 4000)`);
  process.exit(1);
}

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

const ver = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
console.log("VERSION", {
  id: ver.data.id,
  state: ver.data.attributes?.appStoreState,
  versionString: ver.data.attributes?.versionString
});

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
  console.log("PATCHED review notes", detail.data.id, "chars", notes.length);
} else {
  const created = await asc(token, "POST", "/v1/appStoreReviewDetails", {
    data: {
      type: "appStoreReviewDetails",
      attributes: attrs,
      relationships: {
        appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
      }
    }
  });
  console.log("CREATED review notes", created.data?.id, "chars", notes.length);
}

console.log("ASC app", `https://appstoreconnect.apple.com/apps/${ASC_APP_ID}/appstore`);
console.log("Done. Attach the new iOS build, then Add for Review.");
