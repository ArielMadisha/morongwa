/** Delete stale ASC 1.1, create 1.3.38, attach build 11 */
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const VERSION_11_ID = "7aea8ed6-8254-4b35-a3f3-b579bc3887dc";
const ASC_APP_ID = "6798004708";
const BUILD_ID = "0f3989ed-b0cd-4988-969e-09f0e72d83c5";
const VERSION_STRING = "1.3.38";

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
  const summary = json?.errors || json?.data?.id || json?.data?.attributes || "ok";
  console.log(method, urlPath, res.status, JSON.stringify(summary).slice(0, 600));
  if (!res.ok) {
    const err = new Error(`${method} ${urlPath} ${res.status}`);
    err.body = json;
    throw err;
  }
  return json;
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

try {
  await asc(token, "DELETE", `/v1/appStoreVersions/${VERSION_11_ID}`);
  console.log("Deleted stale version 1.1");
} catch (e) {
  console.warn("Delete 1.1:", e.message);
}

const created = await asc(token, "POST", "/v1/appStoreVersions", {
  data: {
    type: "appStoreVersions",
    attributes: { platform: "IOS", versionString: VERSION_STRING },
    relationships: { app: { data: { type: "apps", id: ASC_APP_ID } } }
  }
});
const vid = created.data.id;
console.log("Created version", vid, VERSION_STRING);

await asc(token, "PATCH", `/v1/appStoreVersions/${vid}`, {
  data: {
    type: "appStoreVersions",
    id: vid,
    relationships: { build: { data: { type: "builds", id: BUILD_ID } } }
  }
});
console.log("Attached build 11");

const ver = await asc(token, "GET", `/v1/appStoreVersions/${vid}?include=build`);
const out = {
  versionId: vid,
  versionString: ver.data.attributes.versionString,
  appStoreState: ver.data.attributes.appStoreState,
  build: ver.data.relationships?.build?.data
};
fs.writeFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "exports", "asc-version-138-created.json"),
  JSON.stringify(out, null, 2)
);
console.log("DONE", JSON.stringify(out, null, 2));
