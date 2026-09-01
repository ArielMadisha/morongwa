import fs from "fs";
import crypto from "crypto";
import path from "path";

const VERSION_ID = "7aea8ed6-8254-4b35-a3f3-b579bc3887dc";
const WHATS_NEW =
  "iOS update: scroll-aware chrome, QwertyMedia navigation, Morongwa tabs, wallet Send/Request Money, and stability fixes. iOS App Review gates preserved (no digital tips, no third-party TV catalog, Tracking=No).";

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
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid, typ: "JWT" })).toString("base64url");
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
  const json = await res.json().catch(() => null);
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

const locs = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}/appStoreVersionLocalizations`);
const loc = (locs.json?.data || [])[0];
if (!loc?.id) {
  console.error("No localization found");
  process.exit(1);
}
const patch = await asc(token, "PATCH", `/v1/appStoreVersionLocalizations/${loc.id}`, {
  data: { type: "appStoreVersionLocalizations", id: loc.id, attributes: { whatsNew: WHATS_NEW } }
});
console.log(JSON.stringify({ ok: patch.ok, locale: loc.attributes?.locale, errors: patch.json?.errors || null }));
