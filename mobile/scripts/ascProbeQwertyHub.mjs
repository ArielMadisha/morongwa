/**
 * Probe QwertyHub ASC version readiness signals (no secrets).
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";

const APP = "6800961337";
const VER = "6a5b3427-9834-4f81-aa42-ae3e452a1e02";

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

const paths = [
  `/v1/appStoreVersions/${VER}`,
  `/v1/appStoreVersions/${VER}/appStoreReviewDetail`,
  `/v1/appStoreVersions/${VER}/appStoreVersionLocalizations?limit=3`,
  `/v1/appStoreVersions/${VER}/build`,
  `/v1/appStoreVersions/${VER}/appStoreVersionPhasedRelease`,
  `/v1/apps/${APP}/appStoreVersions?filter[platform]=IOS&limit=5`,
  `/v1/apps/${APP}/reviewSubmissions?filter[platform]=IOS&limit=5`,
  `/v1/apps/${APP}/appInfos?limit=5`
];

for (const p of paths) {
  const r = await asc(token, p);
  const d = r.json?.data;
  const err = r.json?.errors?.[0];
  console.log(
    JSON.stringify(
      {
        path: p,
        status: r.status,
        state: d?.attributes?.appStoreState || d?.attributes?.state,
        versionString: d?.attributes?.versionString,
        attrs: d && !Array.isArray(d) ? d.attributes : Array.isArray(d) ? d.map((x) => ({ id: x.id, a: x.attributes })) : null,
        err: err ? { code: err.code, detail: err.detail } : null
      },
      null,
      2
    )
  );
}

// Try creating a dry-run feel: GET review submission items N/A
// Check ageRatingDeclaration
const age = await asc(token, `/v1/appStoreVersions/${VER}/ageRatingDeclaration`);
console.log("ageRating", age.status, JSON.stringify(age.json?.data?.attributes || age.json?.errors?.[0] || null).slice(0, 400));

const infos = await asc(token, `/v1/apps/${APP}/appInfos?limit=5`);
const infoId = infos.json?.data?.[0]?.id;
if (infoId) {
  const age2 = await asc(token, `/v1/appInfos/${infoId}/ageRatingDeclaration`);
  console.log("infoAge", age2.status, JSON.stringify(age2.json?.data?.attributes || age2.json?.errors?.[0] || null).slice(0, 300));
  const cats = await asc(token, `/v1/appInfos/${infoId}`);
  console.log("appInfo", JSON.stringify(cats.json?.data?.attributes || null, null, 2));
}
