/**
 * Create Qwertymates iOS appStoreVersion 1.1.0, attach latest VALID build, submit for review.
 * Run after EAS submit uploads a new build.
 *
 * Usage:
 *   node scripts/ascPrepareQwertymatesIosUpdate.mjs
 *   node scripts/ascPrepareQwertymatesIosUpdate.mjs --build-id <uuid> --version 1.1.0
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const ASC_APP_ID = "6798004708";
const LIVE_VERSION_ID = "b1ec529b-acc3-4935-b109-8ae6cb94d645";
const MARKETING_VERSION = process.argv.includes("--version")
  ? process.argv[process.argv.indexOf("--version") + 1]
  : "1.1.0";
const WANT_BUILD_ID = process.argv.includes("--build-id")
  ? process.argv[process.argv.indexOf("--build-id") + 1]
  : null;

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
  const text = await res.text();
  let json;
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

const result = { marketingVersion: MARKETING_VERSION, steps: [] };
const log = (name, data) => {
  result.steps.push({ name, ...data });
  console.log(name, JSON.stringify(data));
};

const versions = await asc(
  token,
  "GET",
  `/v1/apps/${ASC_APP_ID}/appStoreVersions?filter[platform]=IOS&limit=20`
);
let version =
  (versions.json?.data || []).find((v) => v.attributes?.versionString === MARKETING_VERSION) ||
  (versions.json?.data || []).find((v) =>
    ["PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW", "REJECTED", "DEVELOPER_REJECTED"].includes(
      v.attributes?.appStoreState
    ) && v.attributes?.versionString !== "1.0"
  );

if (!version) {
  const created = await asc(token, "POST", "/v1/appStoreVersions", {
    data: {
      type: "appStoreVersions",
      attributes: { platform: "IOS", versionString: MARKETING_VERSION, releaseType: "AFTER_APPROVAL" },
      relationships: { app: { data: { type: "apps", id: ASC_APP_ID } } }
    }
  });
  version = created.json?.data;
  log("createVersion", { ok: created.ok, id: version?.id, errors: created.json?.errors || null });
} else {
  log("existingVersion", {
    id: version.id,
    versionString: version.attributes?.versionString,
    state: version.attributes?.appStoreState
  });
}

const versionId = version?.id;
if (!versionId) {
  console.error("No version id");
  process.exit(2);
}

// Copy localization from live 1.0 if new version has none
const locs = await asc(token, "GET", `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
if (!(locs.json?.data || []).length) {
  const liveLocs = await asc(token, "GET", `/v1/appStoreVersions/${LIVE_VERSION_ID}/appStoreVersionLocalizations`);
  const src = (liveLocs.json?.data || [])[0];
  if (src) {
    const a = src.attributes || {};
    const created = await asc(token, "POST", "/v1/appStoreVersionLocalizations", {
      data: {
        type: "appStoreVersionLocalizations",
        attributes: {
          locale: a.locale || "en-GB",
          description: a.description,
          keywords: a.keywords,
          supportUrl: a.supportUrl,
          marketingUrl: a.marketingUrl,
          promotionalText: a.promotionalText,
          whatsNew:
            "iOS update: scroll-aware chrome, QwertyMedia navigation, Morongwa tabs, wallet Send/Request Money, and stability fixes. iOS App Review gates preserved (no digital tips, no third-party TV catalog, Tracking=No)."
        },
        relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: versionId } } }
      }
    });
    log("localization", { ok: created.ok, locale: a.locale, errors: created.json?.errors || null });
  }
}

// Find build
let buildId = WANT_BUILD_ID;
if (!buildId) {
  const builds = await asc(
    token,
    "GET",
    `/v1/builds?filter[app]=${ASC_APP_ID}&sort=-uploadedDate&limit=15&fields[builds]=version,uploadedDate,processingState,expired`
  );
  const valid = (builds.json?.data || []).find((b) => b.attributes?.processingState === "VALID");
  buildId = valid?.id || null;
  log("findBuild", {
    buildId,
    version: valid?.attributes?.version,
    uploaded: valid?.attributes?.uploadedDate
  });
}

if (buildId) {
  const attach = await asc(token, "PATCH", `/v1/appStoreVersions/${versionId}`, {
    data: {
      type: "appStoreVersions",
      id: versionId,
      relationships: { build: { data: { type: "builds", id: buildId } } }
    }
  });
  log("attachBuild", { ok: attach.ok, buildId, errors: attach.json?.errors || null });
}

// Review detail
const detailGet = await asc(token, "GET", `/v1/appStoreVersions/${versionId}/appStoreReviewDetail`);
const reviewAttrs = {
  contactFirstName: "Ariel",
  contactLastName: "Madisha",
  contactEmail: "administrator@qwertymates.com",
  contactPhone: "+27815826899",
  demoAccountRequired: false,
  demoAccountName: "",
  demoAccountPassword: "",
  notes:
    "Qwertymates iOS update. Reviewers can register a new account on Sign Up (no fixed demo password). " +
    "Production API: https://api.qwertymates.com. Privacy: https://www.qwertymates.com/policies/privacy-policy. " +
    "iOS: no creator digital tips, no Facebook-ingested TV (5.2.3), Tracking=No. Support: support@qwertymates.com."
};
if (detailGet.json?.data?.id) {
  await asc(token, "PATCH", `/v1/appStoreReviewDetails/${detailGet.json.data.id}`, {
    data: { type: "appStoreReviewDetails", id: detailGet.json.data.id, attributes: reviewAttrs }
  });
} else {
  await asc(token, "POST", "/v1/appStoreReviewDetails", {
    data: {
      type: "appStoreReviewDetails",
      attributes: reviewAttrs,
      relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: versionId } } }
    }
  });
}
log("reviewDetail", { ok: true });

const subs = await asc(token, "GET", `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=10`);
let subId =
  (subs.json?.data || []).find((s) => s.attributes?.state === "READY_FOR_REVIEW")?.id || null;
if (!subId) {
  const created = await asc(token, "POST", "/v1/reviewSubmissions", {
    data: {
      type: "reviewSubmissions",
      attributes: { platform: "IOS" },
      relationships: { app: { data: { type: "apps", id: ASC_APP_ID } } }
    }
  });
  subId = created.json?.data?.id || null;
  log("createSubmission", { id: subId, errors: created.json?.errors || null });
}

if (subId) {
  const item = await asc(token, "POST", "/v1/reviewSubmissionItems", {
    data: {
      type: "reviewSubmissionItems",
      relationships: {
        reviewSubmission: { data: { type: "reviewSubmissions", id: subId } },
        appStoreVersion: { data: { type: "appStoreVersions", id: versionId } }
      }
    }
  });
  log("attachVersion", { ok: item.ok, errors: item.json?.errors || null });
  const submit = await asc(token, "PATCH", `/v1/reviewSubmissions/${subId}`, {
    data: { type: "reviewSubmissions", id: subId, attributes: { submitted: true } }
  });
  log("submit", {
    ok: submit.ok,
    state: submit.json?.data?.attributes?.state,
    submittedDate: submit.json?.data?.attributes?.submittedDate,
    errors: submit.json?.errors || null
  });
  result.submitted = Boolean(submit.ok);
  result.submissionId = subId;
}

const ver2 = await asc(token, "GET", `/v1/appStoreVersions/${versionId}`);
result.versionId = versionId;
result.buildId = buildId;
result.finalVersionState = ver2.json?.data?.attributes?.appStoreState || null;
fs.mkdirSync("exports", { recursive: true });
fs.writeFileSync(path.join("exports", "asc-qwertymates-ios-update.json"), JSON.stringify(result, null, 2));
console.log("FINAL", JSON.stringify(result, null, 2));
