/**
 * Submit QwertyHub iOS 1.0.5 (PREPARE_FOR_SUBMISSION) for App Review.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const APP_ID = "6800961337";
const VERSION_ID = "6a5b3427-9834-4f81-aa42-ae3e452a1e02";

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

const result = { steps: [] };
const log = (name, data) => {
  result.steps.push({ name, ...data });
  console.log(name, JSON.stringify(data));
};

const ver = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}?include=build`);
log("version", {
  versionString: ver.json?.data?.attributes?.versionString,
  state: ver.json?.data?.attributes?.appStoreState,
  buildId: ver.json?.data?.relationships?.build?.data?.id || null
});

const created = await asc(token, "POST", "/v1/reviewSubmissions", {
  data: {
    type: "reviewSubmissions",
    attributes: { platform: "IOS" },
    relationships: { app: { data: { type: "apps", id: APP_ID } } }
  }
});
const subId = created.json?.data?.id || null;
log("createSubmission", { status: created.status, ok: created.ok, id: subId, errors: created.json?.errors || null });

if (subId) {
  const item = await asc(token, "POST", "/v1/reviewSubmissionItems", {
    data: {
      type: "reviewSubmissionItems",
      relationships: {
        reviewSubmission: { data: { type: "reviewSubmissions", id: subId } },
        appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
      }
    }
  });
  log("attachVersion", { status: item.status, ok: item.ok, errors: item.json?.errors || null });

  const submit = await asc(token, "PATCH", `/v1/reviewSubmissions/${subId}`, {
    data: { type: "reviewSubmissions", id: subId, attributes: { submitted: true } }
  });
  log("submit", {
    status: submit.status,
    ok: submit.ok,
    state: submit.json?.data?.attributes?.state || null,
    submittedDate: submit.json?.data?.attributes?.submittedDate || null,
    errors: submit.json?.errors || null
  });
  result.submitted = Boolean(submit.ok);
  result.submissionId = subId;
}

const ver2 = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
result.finalVersionState = ver2.json?.data?.attributes?.appStoreState || null;
fs.mkdirSync("exports", { recursive: true });
fs.writeFileSync(path.join("exports", "asc-qwertyhub-submit.json"), JSON.stringify(result, null, 2));
console.log("FINAL", JSON.stringify({ submitted: result.submitted, submissionId: result.submissionId, versionState: result.finalVersionState }, null, 2));
