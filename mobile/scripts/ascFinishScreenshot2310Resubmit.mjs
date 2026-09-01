/**
 * Finish 2.3.10 resubmit after screenshots uploaded.
 * Clears cancelled submission items, then submits a fresh reviewSubmission.
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(__dirname, "..");
const ASC_APP_ID = "6798004708";
const VERSION_ID = "b1ec529b-acc3-4935-b109-8ae6cb94d645";
const OLD_SUB = "5348e907-c57f-45af-9f69-c3bda9351276";
const DRAFT_SUB = "ebae8855-6258-45f3-829d-c010478415eb";
const OUT = path.join(MOBILE_ROOT, "exports", "asc-screenshot-2310-resubmit.json");

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

const result = { steps: [], submitted: false };

async function clearSubmissionItems(subId) {
  // ensure canceled
  const cancel = await tryAsc(token, "PATCH", `/v1/reviewSubmissions/${subId}`, {
    data: {
      type: "reviewSubmissions",
      id: subId,
      attributes: { canceled: true }
    }
  });
  result.steps.push({ clearCancel: subId, ...cancel, body: undefined, jsonState: cancel.json?.data?.attributes?.state });

  const items = await tryAsc(token, "GET", `/v1/reviewSubmissions/${subId}/items`);
  const ids = (items.json?.data || []).map((i) => i.id);
  for (const id of ids) {
    const del = await tryAsc(token, "DELETE", `/v1/reviewSubmissionItems/${id}`);
    result.steps.push({ deleteItem: id, ok: del.ok, status: del.status, err: del.body });
  }
}

await clearSubmissionItems(OLD_SUB);
await clearSubmissionItems(DRAFT_SUB);

// poll version until not locked
let versionState = null;
for (let i = 0; i < 24; i++) {
  const ver = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
  versionState = ver.data?.attributes?.appStoreState;
  console.log("version state", versionState, "try", i);
  result.steps.push({ poll: i, versionState });
  if (
    ["READY_FOR_REVIEW", "PREPARE_FOR_SUBMISSION", "REJECTED", "METADATA_REJECTED", "DEVELOPER_REJECTED"].includes(
      versionState
    )
  ) {
    // still may be locked to old submission; try add anyway after deletes
    break;
  }
  await new Promise((r) => setTimeout(r, 5000));
}

// Prefer existing draft if still usable; else create new
let subId = DRAFT_SUB;
const draft = await tryAsc(token, "GET", `/v1/reviewSubmissions/${DRAFT_SUB}`);
const draftState = draft.json?.data?.attributes?.state;
console.log("draft state", draftState);
if (!draft.ok || ["COMPLETE", "CANCELLED", "UNRESOLVED_ISSUES"].includes(draftState)) {
  const created = await tryAsc(token, "POST", "/v1/reviewSubmissions", {
    data: {
      type: "reviewSubmissions",
      attributes: { platform: "IOS" },
      relationships: {
        app: { data: { type: "apps", id: ASC_APP_ID } }
      }
    }
  });
  result.steps.push({ createSub: created.ok, id: created.json?.data?.id, err: created.body });
  if (!created.ok) {
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.error("Could not create submission");
    process.exit(1);
  }
  subId = created.json.data.id;
}

const add = await tryAsc(token, "POST", "/v1/reviewSubmissionItems", {
  data: {
    type: "reviewSubmissionItems",
    relationships: {
      reviewSubmission: { data: { type: "reviewSubmissions", id: subId } },
      appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
    }
  }
});
result.steps.push({ addItem: add.ok, status: add.status, err: add.body, subId });
console.log("addItem", add.ok, add.status, JSON.stringify(add.body)?.slice(0, 800));

if (!add.ok) {
  // last resort: wait longer and retry once
  await new Promise((r) => setTimeout(r, 20000));
  await clearSubmissionItems(OLD_SUB);
  const add2 = await tryAsc(token, "POST", "/v1/reviewSubmissionItems", {
    data: {
      type: "reviewSubmissionItems",
      relationships: {
        reviewSubmission: { data: { type: "reviewSubmissions", id: subId } },
        appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
      }
    }
  });
  result.steps.push({ addItemRetry: add2.ok, status: add2.status, err: add2.body });
  console.log("addItemRetry", add2.ok, add2.status, JSON.stringify(add2.body)?.slice(0, 800));
  if (!add2.ok) {
    const ver = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
    const subs = await asc(
      token,
      "GET",
      `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=8`
    );
    result.versionState = ver.data.attributes?.appStoreState;
    result.submissions = (subs.data || []).map((s) => ({
      id: s.id,
      state: s.attributes?.state
    }));
    result.submitted = false;
    result.ownerAction =
      "In ASC → Review Submissions: cancel unresolved 5348… if still open, then Add for Review on version 1.0 (screenshots + notes already updated).";
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log("Wrote", OUT);
    process.exit(2);
  }
}

const submit = await tryAsc(token, "PATCH", `/v1/reviewSubmissions/${subId}`, {
  data: {
    type: "reviewSubmissions",
    id: subId,
    attributes: { submitted: true }
  }
});
result.steps.push({ submit: submit.ok, status: submit.status, err: submit.body, state: submit.json?.data?.attributes?.state });
console.log("submit", submit.ok, submit.status, submit.json?.data?.attributes?.state);

result.submitted = Boolean(submit.ok);
result.submissionId = subId;
result.submitState = submit.json?.data?.attributes?.state;

const ver = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
const subs = await asc(
  token,
  "GET",
  `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=8`
);
result.versionState = ver.data.attributes?.appStoreState;
result.submissions = (subs.data || []).map((s) => ({
  id: s.id,
  state: s.attributes?.state,
  submittedDate: s.attributes?.submittedDate
}));

fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log("FINAL", JSON.stringify({ submitted: result.submitted, submissionId: subId, versionState: result.versionState, submissions: result.submissions }, null, 2));
console.log("Wrote", OUT);
if (!result.submitted) process.exit(2);
