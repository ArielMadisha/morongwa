/**
 * Diagnose Qwertymates iOS submission issue from Apple's "There's an issue" email.
 * Writes mobile/exports/asc-ios-issue-diagnose.json (no secrets).
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";

const VERSION_ID = "b1ec529b-acc3-4935-b109-8ae6cb94d645";
const ASC_APP_ID = "6798004708";
const SUB_ID = "baefad44-d63e-4562-a514-a47f3ef799b3";
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

async function tryAsc(token, method, urlPath) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: String(text).slice(0, 2000) };
  }
  return { ok: res.ok, status: res.status, path: urlPath, json };
}

function slim(r) {
  if (!r) return r;
  const data = r.json?.data;
  const errors = r.json?.errors;
  const included = r.json?.included;
  return {
    ok: r.ok,
    status: r.status,
    path: r.path,
    errors: errors
      ? errors.map((e) => ({
          status: e.status,
          code: e.code,
          title: e.title,
          detail: e.detail
        }))
      : undefined,
    data: Array.isArray(data)
      ? data.map((d) => ({
          id: d.id,
          type: d.type,
          attributes: d.attributes,
          relationships: Object.fromEntries(
            Object.entries(d.relationships || {}).map(([k, v]) => [k, v?.data])
          )
        }))
      : data
        ? {
            id: data.id,
            type: data.type,
            attributes: data.attributes,
            relationships: Object.fromEntries(
              Object.entries(data.relationships || {}).map(([k, v]) => [k, v?.data])
            )
          }
        : null,
    included: (included || []).map((i) => ({
      id: i.id,
      type: i.type,
      attributes: i.attributes
    }))
  };
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

const paths = [
  `/v1/apps?limit=50`,
  `/v1/apps/${ASC_APP_ID}`,
  `/v1/apps/${ASC_APP_ID}/appStoreVersions?filter[platform]=IOS&limit=20`,
  `/v1/appStoreVersions/${VERSION_ID}?include=build,appStoreVersionSubmission,appStoreReviewDetail`,
  `/v1/appStoreVersions/${VERSION_ID}/appStoreReviewDetail`,
  `/v1/reviewSubmissions/${SUB_ID}?include=items,appStoreVersionForReview`,
  `/v1/reviewSubmissions/${SUB_ID}/items`,
  `/v1/reviewSubmissions/${OLD_SUB}?include=items,appStoreVersionForReview`,
  `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=15`,
  `/v1/resolutionCenterThreads?filter[appStoreVersion]=${VERSION_ID}`,
  `/v1/resolutionCenterThreads?filter[reviewSubmission]=${SUB_ID}`,
  `/v1/apps/${ASC_APP_ID}/resolutionCenterThreads`,
  `/v1/apps/${ASC_APP_ID}/appInfos`,
  `/v1/apps/${ASC_APP_ID}/appDataUsages`
];

const out = { fetchedAt: new Date().toISOString(), results: {} };
for (const p of paths) {
  const r = await tryAsc(token, "GET", p);
  out.results[p] = slim(r);
  console.log(r.status, p, r.ok ? "ok" : (r.json?.errors?.[0]?.code || r.json?.errors?.[0]?.title || "fail"));
}

// Follow-up: if we have app infos, get age rating + localization
const infos = out.results[`/v1/apps/${ASC_APP_ID}/appInfos`]?.data || [];
for (const info of infos) {
  const extra = [
    `/v1/appInfos/${info.id}/ageRatingDeclaration`,
    `/v1/appInfos/${info.id}/appInfoLocalizations`
  ];
  for (const p of extra) {
    const r = await tryAsc(token, "GET", p);
    out.results[p] = slim(r);
    console.log(r.status, p, r.ok ? "ok" : "fail");
  }
}

// Follow-up: review submission items detail
const items = out.results[`/v1/reviewSubmissions/${SUB_ID}/items`]?.data || [];
for (const item of items) {
  const p = `/v1/reviewSubmissionItems/${item.id}`;
  const r = await tryAsc(token, "GET", p);
  out.results[p] = slim(r);
  console.log(r.status, p, r.ok ? "ok" : "fail");
}

const exportDir = path.join(process.cwd(), "exports");
fs.mkdirSync(exportDir, { recursive: true });
const outPath = path.join(exportDir, "asc-ios-issue-diagnose.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log("WROTE", outPath);
