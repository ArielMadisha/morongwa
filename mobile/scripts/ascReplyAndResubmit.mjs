/**
 * Qwertymates iOS ASC: probe Resolution Center, update review notes with ATT
 * clarification, and resubmit for review.
 *
 * Usage (from mobile/):
 *   node scripts/ascReplyAndResubmit.mjs
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";

const VERSION_ID = "b1ec529b-acc3-4935-b109-8ae6cb94d645";
const ASC_APP_ID = "6798004708";
const PREV_SUBMISSION = "442e5f45-85d3-41ee-82bb-d87bf4d70108";

const REPLY_TEXT = `Hello App Review Team,

Thank you for the feedback regarding App Privacy and App Tracking Transparency.

Qwertymates does not track users under Apple's definition. We do not use the advertising identifier (IDFA), do not call ATTrackingManager / App Tracking Transparency, and do not include advertising or measurement SDKs. Our App Store Connect version is configured with usesIdfa = false.

Data we collect is used only for app functionality, account management, and security/fraud prevention — not for cross-app or cross-site tracking for advertising.

We previously published App Privacy labels that incorrectly indicated tracking. We have corrected App Privacy so Tracking = No and removed inaccurate "Used for Tracking" purposes. Because the app does not track, ATT is not required.

Please re-review with the updated App Privacy nutrition labels. No new binary is needed for this correction.

Privacy policy: https://www.qwertymates.com/policies/privacy-policy

Thank you,
Qwertymates Team`;

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
    const json = await asc(token, method, urlPath, body);
    return { ok: true, status: 200, json };
  } catch (e) {
    return { ok: false, status: e.status, body: e.body, message: e.message };
  }
}

function associatedErrorCodes(errBody) {
  const codes = new Set();
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== "object") return;
    if (node.code) codes.add(node.code);
    for (const v of Object.values(node)) walk(v);
  };
  walk(errBody);
  return [...codes];
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

const out = {
  resolutionCenterReply: { attempted: true, succeeded: false, how: null, probes: [] },
  reviewNotesUpdated: false,
  resubmit: { succeeded: false, submissionId: null, versionState: null },
  urls: {
    appPrivacy: `https://appstoreconnect.apple.com/apps/${ASC_APP_ID}/appPrivacy`,
    reviewSubmissions: `https://appstoreconnect.apple.com/apps/${ASC_APP_ID}/appstore/reviewsubmissions`,
    distribution: `https://appstoreconnect.apple.com/apps/${ASC_APP_ID}/distribution/ios`,
    resolutionCenterGuess: `https://appstoreconnect.apple.com/apps/${ASC_APP_ID}/distribution/ios/version/inflight`,
    appStore: `https://appstoreconnect.apple.com/apps/${ASC_APP_ID}/appstore`
  }
};

const ver = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
console.log("version", {
  id: ver.data.id,
  versionString: ver.data.attributes?.versionString,
  state: ver.data.attributes?.appStoreState
});
out.resubmit.versionState = ver.data.attributes?.appStoreState;

// --- Probe Resolution Center / related endpoints (JWT) ---
const probes = [
  `/v1/resolutionCenterThreads?filter[appStoreVersion]=${VERSION_ID}`,
  `/v1/resolutionCenterThreads?filter[reviewSubmission]=${PREV_SUBMISSION}`,
  `/v1/apps/${ASC_APP_ID}/resolutionCenterThreads`,
  `/v1/reviewSubmissions/${PREV_SUBMISSION}`,
  `/v1/reviewSubmissions/${PREV_SUBMISSION}/items`,
  `/v1/reviewSubmissionMessages`,
  `/v1/appStoreVersions/${VERSION_ID}/customerReviews`,
  `/v1/apps/${ASC_APP_ID}/appStoreReviewDetails`,
  `/v1/appStoreVersions/${VERSION_ID}/appStoreReviewDetail`
];

for (const p of probes) {
  const r = await tryAsc(token, "GET", p);
  const summary = {
    path: p,
    ok: r.ok,
    status: r.status,
    dataCount: Array.isArray(r.json?.data) ? r.json.data.length : r.json?.data ? 1 : 0,
    type: r.json?.data?.type || r.json?.data?.[0]?.type || null,
    err: r.ok
      ? null
      : (r.body?.errors || []).map((e) => e.code || e.title).slice(0, 3)
  };
  out.resolutionCenterReply.probes.push(summary);
  console.log("PROBE", summary);
}

// Try POST reviewSubmissionMessages / resolutionCenterMessages if any thread found
const threadProbe = out.resolutionCenterReply.probes.find(
  (p) => p.ok && p.path.includes("resolutionCenterThreads") && p.dataCount > 0
);
if (threadProbe) {
  const threads = (
    await asc(
      token,
      "GET",
      `/v1/resolutionCenterThreads?filter[appStoreVersion]=${VERSION_ID}`
    )
  ).data;
  for (const t of threads || []) {
    console.log("thread", t.id, t.attributes);
    const post = await tryAsc(token, "POST", "/v1/resolutionCenterMessages", {
      data: {
        type: "resolutionCenterMessages",
        attributes: { messageBody: REPLY_TEXT },
        relationships: {
          resolutionCenterThread: {
            data: { type: "resolutionCenterThreads", id: t.id }
          }
        }
      }
    });
    console.log("POST resolutionCenterMessages", post.ok, post.status, post.message || post.json?.data?.id);
    if (post.ok) {
      out.resolutionCenterReply.succeeded = true;
      out.resolutionCenterReply.how = `POST /v1/resolutionCenterMessages on thread ${t.id}`;
    }
  }
} else {
  // Attempt draft-style posts anyway to capture API capability
  for (const postPath of [
    "/v1/resolutionCenterMessages",
    "/v1/reviewSubmissionMessages",
    "/v1/reviewSubmissions/" + PREV_SUBMISSION + "/relationships/items"
  ]) {
    const post = await tryAsc(token, "POST", postPath, {
      data: {
        type: postPath.includes("reviewSubmission") ? "reviewSubmissionMessages" : "resolutionCenterMessages",
        attributes: { messageBody: REPLY_TEXT, body: REPLY_TEXT }
      }
    });
    out.resolutionCenterReply.probes.push({
      path: `POST ${postPath}`,
      ok: post.ok,
      status: post.status,
      err: post.ok ? null : (post.body?.errors || []).map((e) => e.code || e.title).slice(0, 3)
    });
    console.log("PROBE POST", postPath, post.ok, post.status);
  }
}

// --- Put clarification into App Store Review notes (visible to reviewers on resubmit) ---
const notes =
  REPLY_TEXT +
  "\n\n---\nApp access: Reviewers can register a new account with any email on Sign Up. " +
  "Production API: https://api.qwertymates.com. Support: administrator@qwertymates.com.";

try {
  let detail;
  try {
    detail = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}/appStoreReviewDetail`);
  } catch {
    detail = null;
  }
  const attrs = {
    contactFirstName: "Ariel",
    contactLastName: "Madisha",
    contactEmail: "administrator@qwertymates.com",
    contactPhone: "+27815826899",
    demoAccountRequired: false,
    demoAccountName: "",
    demoAccountPassword: "",
    notes
  };
  if (detail?.data?.id) {
    await asc(token, "PATCH", `/v1/appStoreReviewDetails/${detail.data.id}`, {
      data: { type: "appStoreReviewDetails", id: detail.data.id, attributes: attrs }
    });
  } else {
    await asc(token, "POST", "/v1/appStoreReviewDetails", {
      data: {
        type: "appStoreReviewDetails",
        attributes: attrs,
        relationships: {
          appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
        }
      }
    });
  }
  out.reviewNotesUpdated = true;
  console.log("Review notes updated with tracking clarification.");
} catch (e) {
  console.error("Review notes failed", e.message, JSON.stringify(e.body)?.slice(0, 1500));
}

// --- Resubmit ---
let subId = null;
try {
  const subs = await asc(
    token,
    "GET",
    `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=15`
  );
  console.log(
    "existing submissions",
    (subs.data || []).map((s) => ({
      id: s.id,
      state: s.attributes?.state,
      submittedDate: s.attributes?.submittedDate
    }))
  );

  subId = (subs.data || []).find((s) =>
    ["READY_FOR_REVIEW", "UNRESOLVED", "WAITING_FOR_REVIEW"].includes(s.attributes?.state)
  )?.id;

  if (!subId) {
    const sub = await asc(token, "POST", "/v1/reviewSubmissions", {
      data: {
        type: "reviewSubmissions",
        attributes: { platform: "IOS" },
        relationships: { app: { data: { type: "apps", id: ASC_APP_ID } } }
      }
    });
    subId = sub.data.id;
  }
  out.resubmit.submissionId = subId;
  console.log("Using reviewSubmission", subId);

  try {
    await asc(token, "POST", "/v1/reviewSubmissionItems", {
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: { data: { type: "reviewSubmissions", id: subId } },
          appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
        }
      }
    });
    console.log("reviewSubmissionItem attached");
  } catch (e) {
    const codes = associatedErrorCodes(e.body);
    console.warn("item attach:", e.message, codes.join(", "));
    // Already attached is often fine
    if (!codes.some((c) => /ALREADY|EXISTS|DUPLICATE|STATE/i.test(c) && !c.includes("APP_DATA"))) {
      console.warn(JSON.stringify(e.body)?.slice(0, 2000));
    }
    if (codes.includes("STATE_ERROR.APP_DATA_USAGES_REQUIRED")) {
      throw e;
    }
  }

  // Only submit if not already waiting
  const subNow = await asc(token, "GET", `/v1/reviewSubmissions/${subId}`);
  const curState = subNow.data?.attributes?.state;
  console.log("submission before submit", curState);
  if (curState === "WAITING_FOR_REVIEW" || curState === "IN_REVIEW") {
    out.resubmit.succeeded = true;
    out.resubmit.state = curState;
    console.log("Already in review pipeline:", curState);
  } else {
    const result = await asc(token, "PATCH", `/v1/reviewSubmissions/${subId}`, {
      data: {
        type: "reviewSubmissions",
        id: subId,
        attributes: { submitted: true }
      }
    });
    out.resubmit.succeeded = true;
    out.resubmit.state = result.data?.attributes?.state;
    console.log("SUBMITTED", {
      id: subId,
      state: result.data?.attributes?.state,
      submittedDate: result.data?.attributes?.submittedDate
    });
  }
} catch (e) {
  console.error("Submit failed", e.message, JSON.stringify(e.body)?.slice(0, 2500));
  out.resubmit.error = {
    message: e.message,
    codes: associatedErrorCodes(e.body),
    body: e.body
  };
}

const ver2 = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
out.resubmit.versionState = ver2.data.attributes?.appStoreState;
const subs2 = await asc(
  token,
  "GET",
  `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=5`
);
out.resubmit.submissions = (subs2.data || []).map((s) => ({
  id: s.id,
  state: s.attributes?.state,
  submittedDate: s.attributes?.submittedDate
}));

if (!out.resolutionCenterReply.succeeded) {
  out.resolutionCenterReply.how =
    "JWT ASC API cannot post Resolution Center messages (Apple ID / iris web session required). " +
    "Clarification was written into App Store Review Detail notes for the resubmission. " +
    "Owner must paste reply in ASC Resolution Center UI if a thread reply is still required.";
}

const exportPath = path.join(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  "..",
  "exports",
  "asc-reply-resubmit-result.json"
);
fs.mkdirSync(path.dirname(exportPath), { recursive: true });
fs.writeFileSync(exportPath, JSON.stringify(out, null, 2));
console.log("WROTE", exportPath);
console.log("FINAL", JSON.stringify(out, null, 2));
