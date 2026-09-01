/**
 * Wait for unresolved submission cancel, then attach version + submit.
 * From mobile/: node scripts/ascRetrySubmitAfter2310.mjs
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(__dirname, "..");
const VERSION_ID = "b1ec529b-acc3-4935-b109-8ae6cb94d645";
const ASC_APP_ID = "6798004708";
const UNRESOLVED = "5348e907-c57f-45af-9f69-c3bda9351276";

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// Ensure cancel requested
let ur = await tryAsc(token, "GET", `/v1/reviewSubmissions/${UNRESOLVED}`);
console.log("unresolved start", ur.json?.data?.attributes?.state || ur.status);
if (ur.ok && ["UNRESOLVED_ISSUES", "WAITING_FOR_REVIEW"].includes(ur.json?.data?.attributes?.state)) {
  const c = await tryAsc(token, "PATCH", `/v1/reviewSubmissions/${UNRESOLVED}`, {
    data: {
      type: "reviewSubmissions",
      id: UNRESOLVED,
      attributes: { canceled: true }
    }
  });
  console.log("cancel request", c.ok, c.status || 200);
}

for (let i = 0; i < 40; i++) {
  ur = await tryAsc(token, "GET", `/v1/reviewSubmissions/${UNRESOLVED}`);
  const st = ur.json?.data?.attributes?.state || `http_${ur.status}`;
  console.log("unresolved", st);
  if (["COMPLETE", "CANCELLED", "CANCELED"].includes(st) || ur.status === 404) break;
  await sleep(15_000);
}

const subs = await asc(
  token,
  "GET",
  `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=8`
);
console.log(
  "subs",
  (subs.data || []).map((s) => ({ id: s.id, state: s.attributes?.state }))
);

let subId = (subs.data || []).find((s) => s.attributes?.state === "READY_FOR_REVIEW")?.id;
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
  console.log("create", created.ok, created.json?.data?.id);
  subId = created.json?.data?.id;
}

const add = await tryAsc(token, "POST", "/v1/reviewSubmissionItems", {
  data: {
    type: "reviewSubmissionItems",
    relationships: {
      reviewSubmission: { data: { type: "reviewSubmissions", id: subId } },
      appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
    }
  }
});
console.log("add", add.ok, add.status || 200, JSON.stringify(add.body || add.json)?.slice(0, 900));

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
  JSON.stringify(submit.body || { state: submit.json?.data?.attributes?.state })?.slice(0, 900)
);

const ver2 = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
const subs2 = await asc(
  token,
  "GET",
  `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=6`
);
const out = {
  versionState: ver2.data.attributes?.appStoreState,
  submissionId: subId,
  submitted: submit.ok,
  addOk: add.ok,
  submissions: (subs2.data || []).map((s) => ({
    id: s.id,
    state: s.attributes?.state,
    submittedDate: s.attributes?.submittedDate
  }))
};
fs.writeFileSync(
  path.join(MOBILE_ROOT, "exports", "asc-2310-resubmit-final.json"),
  JSON.stringify(out, null, 2)
);
console.log("FINAL", JSON.stringify(out, null, 2));
