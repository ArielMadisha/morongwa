/** Inspect/fix ASC version 1.1 for build 11 attach */
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const VERSION_11_ID = "7aea8ed6-8254-4b35-a3f3-b579bc3887dc";
const ASC_APP_ID = "6798004708";
const BUILD_ID = "0f3989ed-b0cd-4988-969e-09f0e72d83c5";

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

async function tryAsc(token, method, urlPath, body) {
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
  return { ok: res.ok, status: res.status, json };
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

const ver = await tryAsc(
  token,
  "GET",
  `/v1/appStoreVersions/${VERSION_11_ID}?include=build,appStoreVersionLocalizations`
);
console.log("version 1.1", JSON.stringify(ver, null, 2).slice(0, 3000));

const patchVer = await tryAsc(token, "PATCH", `/v1/appStoreVersions/${VERSION_11_ID}`, {
  data: {
    type: "appStoreVersions",
    id: VERSION_11_ID,
    attributes: { versionString: "1.3.38", usesIdfa: false, copyright: "2026 ARIEL CAPITAL INVESTMENT (PTY) LTD" }
  }
});
console.log("patch versionString", JSON.stringify(patchVer, null, 2).slice(0, 1500));

const attach = await tryAsc(token, "PATCH", `/v1/appStoreVersions/${VERSION_11_ID}`, {
  data: {
    type: "appStoreVersions",
    id: VERSION_11_ID,
    relationships: { build: { data: { type: "builds", id: BUILD_ID } } }
  }
});
console.log("attach build 11", JSON.stringify(attach, null, 2).slice(0, 1500));

const ver2 = await tryAsc(token, "GET", `/v1/appStoreVersions/${VERSION_11_ID}?include=build`);
const out = {
  version: ver2.json?.data?.attributes,
  build: ver2.json?.data?.relationships?.build,
  included: ver2.json?.included
};
fs.writeFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "exports", "asc-version-fix-attempt.json"),
  JSON.stringify(out, null, 2)
);
console.log("RESULT", JSON.stringify(out, null, 2));
