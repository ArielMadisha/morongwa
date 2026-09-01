/**
 * After EAS submit: wait for ASC to process the new IPA, attach it to the
 * rejected 1.0 version, and try Add for Review.
 *
 * Usage (from mobile/):
 *   node scripts/ascAttachBuildAndResubmit.mjs
 *   node scripts/ascAttachBuildAndResubmit.mjs --version 1.3.32 --build 8
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";

const VERSION_ID = "b1ec529b-acc3-4935-b109-8ae6cb94d645";
const ASC_APP_ID = "6798004708";
const WANT_VERSION = process.argv.includes("--version")
  ? process.argv[process.argv.indexOf("--version") + 1]
  : "1.3.32";
const WANT_BUILD = process.argv.includes("--build")
  ? process.argv[process.argv.indexOf("--build") + 1]
  : "8";

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

async function findBuild(tok) {
  const builds = await asc(
    tok,
    "GET",
    `/v1/builds?filter[app]=${ASC_APP_ID}&sort=-uploadedDate&limit=20&include=preReleaseVersion`
  );
  const pre = new Map((builds.included || []).map((i) => [i.id, i]));
  const rows = (builds.data || []).map((b) => {
    const preId = b.relationships?.preReleaseVersion?.data?.id;
    const ver = pre.get(preId)?.attributes?.version;
    return {
      id: b.id,
      version: ver,
      buildNumber: b.attributes?.version,
      processingState: b.attributes?.processingState,
      uploadedDate: b.attributes?.uploadedDate
    };
  });
  return {
    rows,
    match: rows.find((r) => r.version === WANT_VERSION && String(r.buildNumber) === String(WANT_BUILD))
  };
}

let match = null;
for (let i = 0; i < 12; i++) {
  const found = await findBuild(token);
  console.log(
    "builds",
    found.rows.slice(0, 6).map((r) => `${r.version} (${r.buildNumber}) ${r.processingState}`)
  );
  match = found.match;
  if (match && match.processingState === "VALID") break;
  if (match) console.log("waiting for VALID, currently", match.processingState);
  else console.log(`waiting for ${WANT_VERSION} (${WANT_BUILD}) to appear`);
  await sleep(30_000);
}

if (!match) {
  console.error("Build not found in ASC yet. Attach manually after processing.");
  process.exit(2);
}
if (match.processingState !== "VALID") {
  console.error("Build still processing:", match);
  process.exit(3);
}

console.log("Attaching build", match.id, "to version", VERSION_ID);
const attach = await tryAsc(token, "PATCH", `/v1/appStoreVersions/${VERSION_ID}`, {
  data: {
    type: "appStoreVersions",
    id: VERSION_ID,
    relationships: {
      build: { data: { type: "builds", id: match.id } }
    }
  }
});
console.log(
  "attach",
  attach.ok,
  attach.status || 200,
  JSON.stringify(attach.body || { state: attach.json?.data?.attributes?.appStoreState })?.slice(0, 800)
);

const ver = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}?include=build`);
console.log("version after attach", {
  state: ver.data.attributes?.appStoreState,
  build: ver.data.relationships?.build?.data,
  included: (ver.included || []).map((i) => ({
    type: i.type,
    id: i.id,
    version: i.attributes?.version,
    processing: i.attributes?.processingState
  }))
});

const subs = await asc(
  token,
  "GET",
  `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=10`
);
console.log(
  "submissions",
  (subs.data || []).map((s) => ({ id: s.id, state: s.attributes?.state }))
);

let subId = (subs.data || []).find((s) =>
  ["READY_FOR_REVIEW", "UNRESOLVED", "WAITING_FOR_REVIEW"].includes(s.attributes?.state)
)?.id;

if (!subId) {
  const created = await tryAsc(token, "POST", "/v1/reviewSubmissions", {
    data: {
      type: "reviewSubmissions",
      attributes: { platform: "IOS" },
      relationships: {
        app: { data: { type: "apps", id: ASC_APP_ID } }
      }
    }
  });
  console.log("create submission", created.ok, created.status || 200, JSON.stringify(created.body || created.json)?.slice(0, 600));
  subId = created.json?.data?.id;
}

if (subId) {
  const item = await tryAsc(token, "POST", "/v1/reviewSubmissionItems", {
    data: {
      type: "reviewSubmissionItems",
      relationships: {
        reviewSubmission: { data: { type: "reviewSubmissions", id: subId } },
        appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
      }
    }
  });
  console.log("add item", item.ok, item.status || 200, JSON.stringify(item.body || item.json)?.slice(0, 600));

  const submit = await tryAsc(token, "PATCH", `/v1/reviewSubmissions/${subId}`, {
    data: {
      type: "reviewSubmissions",
      id: subId,
      attributes: { submitted: true }
    }
  });
  console.log(
    "submit",
    submit.ok,
    submit.status || 200,
    JSON.stringify(submit.body || { state: submit.json?.data?.attributes?.state })?.slice(0, 800)
  );
}

const out = {
  build: match,
  versionState: (await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`)).data.attributes
    ?.appStoreState,
  attachOk: attach.ok,
  subId
};
fs.writeFileSync(
  path.join(process.cwd(), "exports", "asc-attach-build-result.json"),
  JSON.stringify(out, null, 2)
);
console.log("FINAL", out);
console.log("ASC: https://appstoreconnect.apple.com/apps/6798004708/appstore/ios/version/inflight");
