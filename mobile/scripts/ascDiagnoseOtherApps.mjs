/**
 * Status of Qwertymates.com + ACBPay iOS listings (no secrets).
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";

const APPS = [
  { name: "Qwertymates", id: "6798004708" },
  { name: "Qwertymates.com", id: "6443939965" },
  { name: "Acbpay", id: "1600228324" }
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

async function asc(token, urlPath) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${urlPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  return { status: res.status, json: await res.json() };
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

const irisProbes = [
  "/iris/v1/apps/6798004708/resolutionCenterThreads?filter[threadType]=REJECTION_BINARY,REJECTION_METADATA,REJECTION_REVIEW_SUBMISSION",
  "/v1/reviewRejections?filter[reviewSubmission]=baefad44-d63e-4562-a514-a47f3ef799b3",
  "/v1/appDataUsageCategories",
  "/v1/apps/6798004708/appAvailabilityV2"
];

const out = { apps: [], iris: [] };
for (const app of APPS) {
  const versions = await asc(
    token,
    `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=8`
  );
  const subs = await asc(
    token,
    `/v1/apps/${app.id}/reviewSubmissions?filter[platform]=IOS&limit=5`
  );
  const row = {
    name: app.name,
    id: app.id,
    versions: (versions.json?.data || []).map((v) => ({
      id: v.id,
      versionString: v.attributes?.versionString,
      state: v.attributes?.appStoreState,
      createdDate: v.attributes?.createdDate
    })),
    submissions: (subs.json?.data || []).map((s) => ({
      id: s.id,
      state: s.attributes?.state,
      submittedDate: s.attributes?.submittedDate
    }))
  };
  out.apps.push(row);
  console.log(JSON.stringify(row, null, 2));
}

for (const p of irisProbes) {
  const r = await asc(token, p);
  const err = r.json?.errors?.[0];
  out.iris.push({
    path: p,
    status: r.status,
    code: err?.code || null,
    detail: err?.detail || null,
    dataCount: Array.isArray(r.json?.data) ? r.json.data.length : r.json?.data ? 1 : 0
  });
  console.log(r.status, p, err?.code || "ok");
}

fs.mkdirSync(path.join(process.cwd(), "exports"), { recursive: true });
fs.writeFileSync(
  path.join(process.cwd(), "exports", "asc-other-apps-ios.json"),
  JSON.stringify(out, null, 2)
);
