/** Final ASC state for iOS 1.3.38 release */
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const VERSION_ID = "7aea8ed6-8254-4b35-a3f3-b579bc3887dc";
const ASC_APP_ID = "6798004708";
const SUBMISSION_ID = "d8bddb8d-4510-48c5-b998-e603347d208a";

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

const ver = await asc(token, `/v1/appStoreVersions/${VERSION_ID}?include=build`);
const detail = await asc(token, `/v1/appStoreVersions/${VERSION_ID}/appStoreReviewDetail`);
const sub = await asc(token, `/v1/reviewSubmissions/${SUBMISSION_ID}`);
const subs = await asc(
  token,
  `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=5`
);

const build = (ver.included || []).find((i) => i.type === "builds");
const out = {
  versionId: VERSION_ID,
  versionString: ver.data?.attributes?.versionString,
  appStoreState: ver.data?.attributes?.appStoreState,
  usesIdfa: ver.data?.attributes?.usesIdfa,
  buildNumber: build?.attributes?.version,
  buildProcessing: build?.attributes?.processingState,
  demoAccountRequired: detail.data?.attributes?.demoAccountRequired,
  submissionId: SUBMISSION_ID,
  submissionState: sub.data?.attributes?.state,
  submittedDate: sub.data?.attributes?.submittedDate,
  allSubmissions: (subs.data || []).map((s) => ({
    id: s.id,
    state: s.attributes?.state,
    submittedDate: s.attributes?.submittedDate
  })),
  easBuildUrl:
    "https://expo.dev/accounts/qwertymates/projects/morongwa-mobile/builds/edc12928-3ec8-49e6-b07f-e50c2395dd15",
  easSubmitUrl:
    "https://expo.dev/accounts/qwertymates/projects/morongwa-mobile/submissions/857e3d02-12dd-4091-94b1-01a5a2777750",
  ascUrl: `https://appstoreconnect.apple.com/apps/${ASC_APP_ID}/appstore/ios/version/inflight`
};

console.log(JSON.stringify(out, null, 2));
fs.writeFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "exports", "asc-ios-138-final-state.json"),
  JSON.stringify(out, null, 2)
);
