/**
 * Cancel UNRESOLVED_ISSUES review submission that still owns the 1.0 version,
 * then attach PREPARE_FOR_SUBMISSION version to the new READY_FOR_REVIEW draft.
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";

const VERSION_ID = "b1ec529b-acc3-4935-b109-8ae6cb94d645";
const ASC_APP_ID = "6798004708";
const UNRESOLVED_SUB = "baefad44-d63e-4562-a514-a47f3ef799b3";
const NEW_SUB = "5348e907-c57f-45af-9f69-c3bda9351276";

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

const unresolved = await asc(token, "GET", `/v1/reviewSubmissions/${UNRESOLVED_SUB}?include=items`);
console.log("unresolved", unresolved.data.attributes?.state, {
  items: (unresolved.included || []).map((i) => ({
    type: i.type,
    id: i.id,
    state: i.attributes?.state
  }))
});

for (const body of [
  { data: { type: "reviewSubmissions", id: UNRESOLVED_SUB, attributes: { canceled: true } } },
  { data: { type: "reviewSubmissions", id: UNRESOLVED_SUB, attributes: { submitted: false } } }
]) {
  const r = await tryAsc(token, "PATCH", `/v1/reviewSubmissions/${UNRESOLVED_SUB}`, body);
  console.log(
    "cancel unresolved",
    r.ok,
    r.status || 200,
    JSON.stringify(r.body || r.json?.data?.attributes)?.slice(0, 500)
  );
}

const items = await tryAsc(token, "GET", `/v1/reviewSubmissions/${UNRESOLVED_SUB}/items`);
console.log(
  "unresolved items",
  items.ok,
  (items.json?.data || []).map((i) => i.id)
);
for (const it of items.json?.data || []) {
  const del = await tryAsc(token, "DELETE", `/v1/reviewSubmissionItems/${it.id}`);
  console.log("delete item", it.id, del.ok, del.status || 200, JSON.stringify(del.body)?.slice(0, 300));
}

const add = await tryAsc(token, "POST", "/v1/reviewSubmissionItems", {
  data: {
    type: "reviewSubmissionItems",
    relationships: {
      reviewSubmission: { data: { type: "reviewSubmissions", id: NEW_SUB } },
      appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
    }
  }
});
console.log("add to new sub", add.ok, add.status || 200, JSON.stringify(add.body || add.json)?.slice(0, 700));

const submit = await tryAsc(token, "PATCH", `/v1/reviewSubmissions/${NEW_SUB}`, {
  data: {
    type: "reviewSubmissions",
    id: NEW_SUB,
    attributes: { submitted: true }
  }
});
console.log("submit new", submit.ok, submit.status || 200, JSON.stringify(submit.body || submit.json)?.slice(0, 700));

const ver = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
const subs = await asc(
  token,
  "GET",
  `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=8`
);
const out = {
  versionState: ver.data.attributes?.appStoreState,
  submissions: (subs.data || []).map((s) => ({
    id: s.id,
    state: s.attributes?.state,
    submittedDate: s.attributes?.submittedDate
  }))
};
console.log("FINAL", JSON.stringify(out, null, 2));
fs.writeFileSync(
  path.join(process.cwd(), "exports", "asc-cancel-unresolved-result.json"),
  JSON.stringify(out, null, 2)
);
console.log("Inflate: https://appstoreconnect.apple.com/apps/6798004708/appstore/ios/version/inflight");
console.log("Review submissions: https://appstoreconnect.apple.com/apps/6798004708/appstore/reviewsubmissions");
