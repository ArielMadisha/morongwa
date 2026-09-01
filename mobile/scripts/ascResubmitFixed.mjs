/**
 * Attach REJECTED version to open reviewSubmission and submit (fixed JSON:API body).
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";

const VERSION_ID = "b1ec529b-acc3-4935-b109-8ae6cb94d645";
const ASC_APP_ID = "6798004708";
const SUB_ID = "baefad44-d63e-4562-a514-a47f3ef799b3";
const P8 = path.join(process.cwd(), "credentials", "AuthKey_ASC.p8");
const KEY_ID = process.env.ASC_KEY_ID || "2SAQZ4V7X9";

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

let issuer = process.env.ASC_ISSUER_ID;
let kid = KEY_ID;
let pem = fs.existsSync(P8) ? fs.readFileSync(P8, "utf8") : null;

if (!issuer || !pem) {
  const list = await gql(
    `query($accountName: String!) {
      account {
        byName(accountName: $accountName) {
          appStoreConnectApiKeysPaginated(first: 5) {
            edges { node { id keyIdentifier } }
          }
        }
      }
    }`,
    { accountName: "qwertymates" }
  );
  const edges = list.account.byName.appStoreConnectApiKeysPaginated.edges || [];
  const node =
    edges.find((e) => e.node.keyIdentifier === KEY_ID)?.node || edges[0]?.node;
  if (!node) throw new Error("No ASC key on Expo");
  const full = await gql(
    `query($id: ID!) {
      appStoreConnectApiKey {
        byId(id: $id) { issuerIdentifier keyIdentifier keyP8 }
      }
    }`,
    { id: node.id }
  );
  const key = full.appStoreConnectApiKey.byId;
  issuer = key.issuerIdentifier;
  kid = key.keyIdentifier;
  pem = key.keyP8;
  console.log("Got ASC key via Expo", kid);
} else {
  console.log("Using local AuthKey_ASC.p8", kid);
}

const token = jwt(issuer, kid, pem);

const ver = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
console.log("version", {
  state: ver.data.attributes?.appStoreState,
  usesIdfa: ver.data.attributes?.usesIdfa
});

const attach = await tryAsc(token, "POST", "/v1/reviewSubmissionItems", {
  data: {
    type: "reviewSubmissionItems",
    relationships: {
      reviewSubmission: { data: { type: "reviewSubmissions", id: SUB_ID } },
      appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
    }
  }
});
console.log(
  "ATTACH",
  attach.ok,
  attach.status || 200,
  JSON.stringify(attach.body || { id: attach.json?.data?.id, attrs: attach.json?.data?.attributes })?.slice(
    0,
    2000
  )
);

const items = await asc(token, "GET", `/v1/reviewSubmissions/${SUB_ID}/items`);
console.log(
  "ITEMS",
  (items.data || []).map((i) => ({ id: i.id, state: i.attributes?.state }))
);

const submit = await tryAsc(token, "PATCH", `/v1/reviewSubmissions/${SUB_ID}`, {
  data: {
    type: "reviewSubmissions",
    id: SUB_ID,
    attributes: { submitted: true }
  }
});
console.log(
  "SUBMIT",
  submit.ok,
  submit.status || 200,
  JSON.stringify(submit.body || submit.json?.data?.attributes)?.slice(0, 1500)
);

const ver2 = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
const subs2 = await asc(
  token,
  "GET",
  `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=5`
);
const final = {
  attached: attach.ok || (items.data || []).length > 0,
  submitted: submit.ok,
  submissionId: SUB_ID,
  submissionState: submit.json?.data?.attributes?.state || null,
  versionState: ver2.data.attributes?.appStoreState,
  attachError: attach.ok ? null : attach.body,
  submitError: submit.ok ? null : submit.body,
  submissions: (subs2.data || []).map((s) => ({
    id: s.id,
    state: s.attributes?.state,
    submittedDate: s.attributes?.submittedDate
  }))
};
console.log("FINAL", JSON.stringify(final, null, 2));
fs.writeFileSync(
  path.join(process.cwd(), "exports", "asc-resubmit-fixed-result.json"),
  JSON.stringify(final, null, 2)
);
process.exitCode = submit.ok ? 0 : 2;
