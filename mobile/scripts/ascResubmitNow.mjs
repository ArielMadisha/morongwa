/**
 * After canceling UNRESOLVED_ISSUES submission, attach REJECTED version and submit.
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";

const VERSION_ID = "b1ec529b-acc3-4935-b109-8ae6cb94d645";
const ASC_APP_ID = "6798004708";
const NEW_SUB = "baefad44-d63e-4562-a514-a47f3ef799b3";

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

const ver = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
console.log("version", ver.data.attributes);

const subs = await asc(
  token,
  "GET",
  `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=10`
);
console.log(
  "subs",
  (subs.data || []).map((s) => ({ id: s.id, state: s.attributes?.state }))
);

let subId =
  (subs.data || []).find((s) =>
    ["READY_FOR_REVIEW", "UNRESOLVED", "WAITING_FOR_REVIEW"].includes(s.attributes?.state)
  )?.id || NEW_SUB;

// If new sub somehow gone, create another
const subCheck = await tryAsc(token, "GET", `/v1/reviewSubmissions/${subId}`);
if (!subCheck.ok || !["READY_FOR_REVIEW"].includes(subCheck.json?.data?.attributes?.state)) {
  const created = await tryAsc(token, "POST", "/v1/reviewSubmissions", {
    data: {
      type: "reviewSubmissions",
      attributes: { platform: "IOS" },
      relationships: { app: { data: { type: "apps", id: ASC_APP_ID } } }
    }
  });
  console.log("create sub", created.ok, created.status || 200, created.json?.data?.id || created.body);
  if (created.ok) subId = created.json.data.id;
}

console.log("using", subId);

// Try both relationship key spellings
const payloads = [
  {
    name: "appStoreVersion",
    data: {
      type: "reviewSubmissionItems",
      relationships: {
        reviewSubmission: { data: { type: "reviewSubmissions", id: subId } },
        appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
      }
    }
  },
  {
    name: "appStoreVersions",
    data: {
      type: "reviewSubmissionItems",
      relationships: {
        reviewSubmission: { data: { type: "reviewSubmissions", id: subId } },
        appStoreVersions: { data: { type: "appStoreVersions", id: VERSION_ID } }
      }
    }
  }
];

let attached = false;
for (const p of payloads) {
  const r = await tryAsc(token, "POST", "/v1/reviewSubmissionItems", p.data);
  console.log(
    "attach",
    p.name,
    r.ok,
    r.status || 200,
    JSON.stringify(r.body || { id: r.json?.data?.id, state: r.json?.data?.attributes })?.slice(0, 1500)
  );
  if (r.ok) {
    attached = true;
    break;
  }
}

// If version still REJECTED and attach fails, try creating a new version 1.0.1
if (!attached) {
  console.log("--- try create new version 1.0.1 ---");
  const nv = await tryAsc(token, "POST", "/v1/appStoreVersions", {
    data: {
      type: "appStoreVersions",
      attributes: {
        platform: "IOS",
        versionString: "1.0.1",
        copyright: "© Qwertymates"
      },
      relationships: {
        app: { data: { type: "apps", id: ASC_APP_ID } }
      }
    }
  });
  console.log(
    "new version",
    nv.ok,
    nv.status || 200,
    JSON.stringify(nv.body || { id: nv.json?.data?.id, state: nv.json?.data?.attributes })?.slice(0, 1200)
  );
  if (nv.ok) {
    const newVid = nv.json.data.id;
    // Attach same build
    const buildId = "e01726c5-86a5-41c8-914b-200a9f945583";
    const br = await tryAsc(token, "PATCH", `/v1/appStoreVersions/${newVid}/relationships/build`, {
      data: { type: "builds", id: buildId }
    });
    console.log("attach build", br.ok, br.status || 200, JSON.stringify(br.body)?.slice(0, 600));

    const ar = await tryAsc(token, "POST", "/v1/reviewSubmissionItems", {
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: { data: { type: "reviewSubmissions", id: subId } },
          appStoreVersion: { data: { type: "appStoreVersions", id: newVid } }
        }
      }
    });
    console.log(
      "attach newVid",
      ar.ok,
      ar.status || 200,
      JSON.stringify(ar.body || { id: ar.json?.data?.id })?.slice(0, 1200)
    );
    if (ar.ok) attached = true;
  }
}

const items = await asc(token, "GET", `/v1/reviewSubmissions/${subId}/items`);
console.log(
  "items now",
  (items.data || []).map((i) => ({ id: i.id, state: i.attributes?.state }))
);

const submit = await tryAsc(token, "PATCH", `/v1/reviewSubmissions/${subId}`, {
  data: {
    type: "reviewSubmissions",
    id: subId,
    attributes: { submitted: true }
  }
});
console.log(
  "SUBMIT",
  submit.ok,
  submit.status || 200,
  JSON.stringify(submit.body || submit.json?.data?.attributes)?.slice(0, 1200)
);

const ver2 = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
const versions = await asc(
  token,
  "GET",
  `/v1/apps/${ASC_APP_ID}/appStoreVersions?filter[platform]=IOS&limit=10`
);
const subs2 = await asc(
  token,
  "GET",
  `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=5`
);
const final = {
  attached,
  submitted: submit.ok,
  submissionId: subId,
  submissionState: submit.json?.data?.attributes?.state || null,
  submitError: submit.ok ? null : submit.body,
  version1_0: ver2.data.attributes?.appStoreState,
  versions: (versions.data || []).map((v) => ({
    id: v.id,
    versionString: v.attributes?.versionString,
    state: v.attributes?.appStoreState
  })),
  submissions: (subs2.data || []).map((s) => ({
    id: s.id,
    state: s.attributes?.state,
    submittedDate: s.attributes?.submittedDate
  }))
};
console.log("FINAL", JSON.stringify(final, null, 2));
fs.writeFileSync(
  path.join(process.cwd(), "exports", "asc-resubmit-now-result.json"),
  JSON.stringify(final, null, 2)
);
