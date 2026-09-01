/**
 * Check ASC builds + EAS submission error (no secrets).
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";

const ASC_APP_ID = "6798004708";
const SUBMISSION_ID = process.argv[2] || "182e56e7-2684-4527-b27c-d1629e006f42";

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
  return res.json();
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

const builds = await asc(
  token,
  `/v1/builds?filter[app]=${ASC_APP_ID}&sort=-uploadedDate&limit=5&fields[builds]=version,uploadedDate,processingState`
);
const versions = await asc(
  token,
  `/v1/apps/${ASC_APP_ID}/appStoreVersions?filter[platform]=IOS&limit=10`
);

let submission = null;
try {
  submission = await gql(
    `query($id: ID!) {
      submission { byId(id: $id) {
        id status platform appStoreConnectAppId
        error { message errorCode }
        logsUrl
      }}
    }`,
    { id: SUBMISSION_ID }
  );
} catch (e) {
  submission = { error: e.message };
}

const out = {
  fetchedAt: new Date().toISOString(),
  builds: (builds.data || []).map((b) => ({
    id: b.id,
    buildNumber: b.attributes?.version,
    processingState: b.attributes?.processingState,
    uploadedDate: b.attributes?.uploadedDate
  })),
  versions: (versions.data || []).map((v) => ({
    id: v.id,
    versionString: v.attributes?.versionString,
    appStoreState: v.attributes?.appStoreState
  })),
  submission: submission?.submission?.byId || submission
};

console.log(JSON.stringify(out, null, 2));
fs.writeFileSync(
  path.join(process.cwd(), "exports", "asc-builds-submission-check.json"),
  JSON.stringify(out, null, 2)
);
