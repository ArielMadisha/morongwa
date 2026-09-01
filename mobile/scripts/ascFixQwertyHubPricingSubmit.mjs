/**
 * Fix QwertyHub ASC blockers: free pricing + retry submit.
 * App Privacy (appDataUsages) must be published manually in ASC if API cannot.
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

// Free pricing (ZAF)
try {
  const freeZA = await asc(
    token,
    "GET",
    `/v1/apps/${APP_ID}/appPricePoints?filter[territory]=ZAF&limit=20`
  );
  const pricePointId = (freeZA.data || []).find(
    (p) => String(p.attributes?.customerPrice) === "0.0"
  )?.id;
  if (!pricePointId) throw new Error("No free ZAF price point");
  const schedule = await asc(token, "POST", `/v1/appPriceSchedules`, {
    data: {
      type: "appPriceSchedules",
      relationships: {
        app: { data: { type: "apps", id: APP_ID } },
        baseTerritory: { data: { type: "territories", id: "ZAF" } },
        manualPrices: { data: [{ type: "appPrices", id: "${price-0}" }] }
      }
    },
    included: [
      {
        type: "appPrices",
        id: "${price-0}",
        attributes: { startDate: null },
        relationships: {
          appPricePoint: { data: { type: "appPricePoints", id: pricePointId } }
        }
      }
    ]
  });
  log("pricing", { ok: true, scheduleId: schedule.data?.id });
} catch (e) {
  log("pricing", { ok: false, message: e.message, body: e.body?.errors?.[0] || null });
}

// Retry submit
try {
  const subs = await asc(token, "GET", `/v1/apps/${APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=10`);
  let subId =
    (subs.data || []).find((s) => s.attributes?.state === "READY_FOR_REVIEW")?.id || null;
  if (!subId) {
    const created = await asc(token, "POST", "/v1/reviewSubmissions", {
      data: {
        type: "reviewSubmissions",
        attributes: { platform: "IOS" },
        relationships: { app: { data: { type: "apps", id: APP_ID } } }
      }
    });
    subId = created.data?.id || null;
    log("createSubmission", { id: subId });
  }
  if (subId) {
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
      log("attachVersion", { ok: true });
    } catch (e) {
      log("attachVersion", { ok: false, message: e.message, errors: e.body?.errors || null });
    }
    try {
      const submit = await asc(token, "PATCH", `/v1/reviewSubmissions/${subId}`, {
        data: { type: "reviewSubmissions", id: subId, attributes: { submitted: true } }
      });
      log("submit", {
        ok: true,
        state: submit.data?.attributes?.state,
        submittedDate: submit.data?.attributes?.submittedDate
      });
      result.submitted = true;
      result.submissionId = subId;
    } catch (e) {
      log("submit", { ok: false, message: e.message, errors: e.body?.errors || null });
    }
  }
} catch (e) {
  log("submitFlow", { ok: false, message: e.message });
}

const ver = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
result.finalVersionState = ver.data?.attributes?.appStoreState || null;
fs.mkdirSync("exports", { recursive: true });
fs.writeFileSync(path.join("exports", "asc-qwertyhub-fix-submit.json"), JSON.stringify(result, null, 2));
console.log("FINAL", JSON.stringify({ submitted: result.submitted, versionState: result.finalVersionState }, null, 2));
