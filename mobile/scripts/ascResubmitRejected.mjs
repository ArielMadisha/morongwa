/**
 * Resubmit REJECTED iOS version after App Privacy fix.
 * Handles UNRESOLVED_ISSUES prior submission + READY_FOR_REVIEW draft.
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";

const VERSION_ID = "b1ec529b-acc3-4935-b109-8ae6cb94d645";
const ASC_APP_ID = "6798004708";
const NEW_SUB = "baefad44-d63e-4562-a514-a47f3ef799b3";
const OLD_SUB = "442e5f45-85d3-41ee-82bb-d87bf4d70108";

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

const ver = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}?include=build,appStoreVersionSubmission`);
console.log("VERSION", {
  id: ver.data.id,
  state: ver.data.attributes?.appStoreState,
  versionString: ver.data.attributes?.versionString,
  build: ver.data.relationships?.build?.data,
  included: (ver.included || []).map((i) => ({ type: i.type, id: i.id, attrs: i.attributes }))
});

for (const subId of [OLD_SUB, NEW_SUB]) {
  const sub = await asc(
    token,
    "GET",
    `/v1/reviewSubmissions/${subId}?include=items,appStoreVersionForReview`
  );
  const items = await asc(token, "GET", `/v1/reviewSubmissions/${subId}/items`);
  console.log("SUB", {
    id: subId,
    state: sub.data.attributes?.state,
    attrs: sub.data.attributes,
    rels: Object.fromEntries(
      Object.entries(sub.data.relationships || {}).map(([k, v]) => [k, v?.data])
    ),
    items: (items.data || []).map((i) => ({
      id: i.id,
      state: i.attributes?.state,
      rels: Object.fromEntries(
        Object.entries(i.relationships || {}).map(([k, v]) => [k, v?.data])
      )
    })),
    included: (sub.included || []).map((i) => ({
      type: i.type,
      id: i.id,
      state: i.attributes?.state || i.attributes?.appStoreState
    }))
  });
}

// Try cancel old unresolved submission
console.log("--- cancel old unresolved ---");
for (const body of [
  { data: { type: "reviewSubmissions", id: OLD_SUB, attributes: { canceled: true } } },
  { data: { type: "reviewSubmissions", id: OLD_SUB, attributes: { submitted: false } } }
]) {
  const r = await tryAsc(token, "PATCH", `/v1/reviewSubmissions/${OLD_SUB}`, body);
  console.log("cancel attempt", r.ok, r.status || 200, JSON.stringify(r.body || r.json?.data?.attributes)?.slice(0, 400));
}

// Inspect new sub items; attach version if missing
console.log("--- attach version to new sub ---");
let attach = await tryAsc(token, "POST", "/v1/reviewSubmissionItems", {
  data: {
    type: "reviewSubmissionItems",
    relationships: {
      reviewSubmission: { data: { type: "reviewSubmissions", id: NEW_SUB } },
      appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
    }
  }
});
console.log(
  "attach new",
  attach.ok,
  attach.status || 200,
  JSON.stringify(attach.body || attach.json)?.slice(0, 1200)
);

// Also try attaching via old unresolved submission if that's the right path
attach = await tryAsc(token, "POST", "/v1/reviewSubmissionItems", {
  data: {
    type: "reviewSubmissionItems",
    relationships: {
      reviewSubmission: { data: { type: "reviewSubmissions", id: OLD_SUB } },
      appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
    }
  }
});
console.log(
  "attach old",
  attach.ok,
  attach.status || 200,
  JSON.stringify(attach.body || attach.json)?.slice(0, 1200)
);

// Try submit both
for (const subId of [NEW_SUB, OLD_SUB]) {
  console.log("--- submit", subId, "---");
  const before = await asc(token, "GET", `/v1/reviewSubmissions/${subId}`);
  console.log("before", before.data.attributes?.state);
  const items = await asc(token, "GET", `/v1/reviewSubmissions/${subId}/items`);
  console.log(
    "items",
    (items.data || []).map((i) => ({ id: i.id, state: i.attributes?.state, rels: i.relationships }))
  );

  // Also try including appStoreVersionForReview relationship on PATCH
  let r = await tryAsc(token, "PATCH", `/v1/reviewSubmissions/${subId}`, {
    data: {
      type: "reviewSubmissions",
      id: subId,
      attributes: { submitted: true },
      relationships: {
        appStoreVersionForReview: { data: { type: "appStoreVersions", id: VERSION_ID } }
      }
    }
  });
  console.log(
    "submit w/ rel",
    r.ok,
    r.status || 200,
    JSON.stringify(r.body || { state: r.json?.data?.attributes?.state })?.slice(0, 800)
  );

  if (!r.ok) {
    r = await tryAsc(token, "PATCH", `/v1/reviewSubmissions/${subId}`, {
      data: {
        type: "reviewSubmissions",
        id: subId,
        attributes: { submitted: true }
      }
    });
    console.log(
      "submit plain",
      r.ok,
      r.status || 200,
      JSON.stringify(r.body || { state: r.json?.data?.attributes?.state })?.slice(0, 800)
    );
  }
}

// Check if version needs state change via appStoreVersionSubmissions
console.log("--- version submission endpoints ---");
const vs = await tryAsc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}/appStoreVersionSubmission`);
console.log("versionSubmission", vs.ok, vs.status || 200, JSON.stringify(vs.body || vs.json)?.slice(0, 600));

const postVs = await tryAsc(token, "POST", "/v1/appStoreVersionSubmissions", {
  data: {
    type: "appStoreVersionSubmissions",
    relationships: {
      appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
    }
  }
});
console.log(
  "POST appStoreVersionSubmissions",
  postVs.ok,
  postVs.status || 200,
  JSON.stringify(postVs.body || postVs.json)?.slice(0, 800)
);

// Final state
const ver2 = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
const subs2 = await asc(
  token,
  "GET",
  `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=5`
);
const final = {
  versionState: ver2.data.attributes?.appStoreState,
  submissions: (subs2.data || []).map((s) => ({
    id: s.id,
    state: s.attributes?.state,
    submittedDate: s.attributes?.submittedDate
  }))
};
console.log("FINAL", JSON.stringify(final, null, 2));
fs.writeFileSync(
  path.join(process.cwd(), "exports", "asc-resubmit-rejected-result.json"),
  JSON.stringify(final, null, 2)
);
