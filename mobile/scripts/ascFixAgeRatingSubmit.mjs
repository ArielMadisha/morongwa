/**
 * Qwertymates iOS ASC: age rating + free pricing + review notes + submit for review.
 *
 * Prerequisites that this script sets via API:
 * - Modern ageRatingDeclarations (via appInfos relationship)
 * - Free app price schedule (ZAF base, price tier 0)
 * - App Store review contact + register-with-email notes
 *
 * Blocker NOT available on public JWT API (as of 2026):
 * - App Privacy nutrition labels / appDataUsages publish
 *   → complete in ASC UI first, then re-run this script.
 *   See: mobile/docs/APP_PRIVACY_DATA_SAFETY_MAPPING.md
 *   URL: https://appstoreconnect.apple.com/apps/6798004708/appPrivacy
 *
 * Usage (from mobile/):
 *   node scripts/ascFixAgeRatingSubmit.mjs
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";

const VERSION_ID = "b1ec529b-acc3-4935-b109-8ae6cb94d645";
const ASC_APP_ID = "6798004708";
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

const ver = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
console.log("version", {
  id: ver.data.id,
  versionString: ver.data.attributes?.versionString,
  state: ver.data.attributes?.appStoreState
});

// --- Age rating (appInfo-scoped; GET_INSTANCE on ageRatingDeclarations is forbidden) ---
const infos = await asc(token, "GET", `/v1/apps/${ASC_APP_ID}/appInfos`);
const appInfoId = infos.data?.[0]?.id;
const ardRel = await asc(token, "GET", `/v1/appInfos/${appInfoId}/ageRatingDeclaration`);
const ardId = ardRel.data.id;

const ageAttrs = {
  advertising: false,
  alcoholTobaccoOrDrugUseOrReferences: "NONE",
  contests: "NONE",
  gambling: false,
  gamblingSimulated: "NONE",
  gunsOrOtherWeapons: "NONE",
  healthOrWellnessTopics: false,
  lootBox: false,
  medicalOrTreatmentInformation: "NONE",
  messagingAndChat: true,
  parentalControls: false,
  profanityOrCrudeHumor: "NONE",
  ageAssurance: false,
  sexualContentGraphicAndNudity: "NONE",
  sexualContentOrNudity: "NONE",
  socialMedia: true,
  socialMediaAgeRestricted: false,
  horrorOrFearThemes: "NONE",
  matureOrSuggestiveThemes: "NONE",
  unrestrictedWebAccess: false,
  userGeneratedContent: true,
  violenceCartoonOrFantasy: "NONE",
  violenceRealistic: "NONE",
  violenceRealisticProlongedGraphicOrSadistic: "NONE"
};

await asc(token, "PATCH", `/v1/ageRatingDeclarations/${ardId}`, {
  data: { type: "ageRatingDeclarations", id: ardId, attributes: ageAttrs }
});
const infosAfter = await asc(token, "GET", `/v1/apps/${ASC_APP_ID}/appInfos`);
console.log("Age rating OK", {
  ardId,
  appStoreAgeRating: infosAfter.data?.[0]?.attributes?.appStoreAgeRating
});

// --- Free pricing (ZAF base, tier 0) ---
try {
  const freeZA = await asc(
    token,
    "GET",
    `/v1/apps/${ASC_APP_ID}/appPricePoints?filter[territory]=ZAF&limit=5`
  );
  const pricePointId = (freeZA.data || []).find(
    (p) => String(p.attributes?.customerPrice) === "0.0"
  )?.id;
  if (!pricePointId) throw new Error("No free ZAF price point");
  const schedule = await asc(token, "POST", `/v1/appPriceSchedules`, {
    data: {
      type: "appPriceSchedules",
      relationships: {
        app: { data: { type: "apps", id: ASC_APP_ID } },
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
  console.log("Pricing OK (free)", {
    scheduleId: schedule.data?.id,
    manualPriceId: schedule.data?.relationships?.manualPrices?.data?.[0]?.id
  });
} catch (e) {
  console.warn("Pricing:", e.message, JSON.stringify(e.body)?.slice(0, 600));
}

// --- Review detail ---
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
    notes:
      "Qwertymates is a social + marketplace app for Southern Africa (posts/wall, messaging, QwertyHub shop, wallet). " +
      "No fixed demo password is required: reviewers can register a new account with any email on the Sign Up screen. " +
      "Production API: https://api.qwertymates.com. Privacy: https://www.qwertymates.com/policies/privacy-policy. " +
      "Support: support@qwertymates.com / administrator@qwertymates.com."
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
  console.log("Review detail OK (register-with-email).");
} catch (e) {
  console.warn("Review detail:", e.message, JSON.stringify(e.body)?.slice(0, 600));
}

// --- Submit ---
let submitted = false;
let subId = null;
try {
  const subs = await asc(
    token,
    "GET",
    `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=10`
  );
  console.log(
    "existing submissions",
    (subs.data || []).map((s) => ({ id: s.id, state: s.attributes?.state }))
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
    if (codes.includes("STATE_ERROR.APP_DATA_USAGES_REQUIRED")) {
      console.error(`
BLOCKER: App Privacy nutrition labels not published (public ASC JWT API cannot write appDataUsages).

Complete in ASC UI, then re-run this script:
  1. Open https://appstoreconnect.apple.com/apps/6798004708/appPrivacy
  2. Click Get Started / Edit
  3. Answer Yes — app collects data (see mobile/docs/APP_PRIVACY_DATA_SAFETY_MAPPING.md)
  4. Declare at least: Contact Info (Name, Email, Phone), User Content (Photos/Videos, Messages),
     Identifiers (User ID), Financial Info (payment/wallet records if linked), Location (if used)
  5. For each: App Functionality (+ Fraud Prevention/Security where relevant); Linked to User = Yes;
     Used for Tracking = No (unless ATT ads SDKs added)
  6. Publish / Save — wait until App Privacy shows as published
  7. Privacy policy URL is already set: https://www.qwertymates.com/policies/privacy-policy
  8. Re-run: node scripts/ascFixAgeRatingSubmit.mjs
`);
      process.exitCode = 3;
    }
    console.warn(JSON.stringify(e.body)?.slice(0, 2500));
    throw e;
  }

  const result = await asc(token, "PATCH", `/v1/reviewSubmissions/${subId}`, {
    data: {
      type: "reviewSubmissions",
      id: subId,
      attributes: { submitted: true }
    }
  });
  submitted = true;
  console.log("SUBMITTED", {
    id: subId,
    state: result.data?.attributes?.state,
    submittedDate: result.data?.attributes?.submittedDate
  });
} catch (e) {
  if (!process.exitCode) process.exitCode = 2;
  console.error("Submit failed", e.message, JSON.stringify(e.body)?.slice(0, 2500));
}

const ver2 = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}`);
const subs2 = await asc(
  token,
  "GET",
  `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=5`
);
console.log("FINAL", {
  submitted,
  submissionId: subId,
  versionState: ver2.data.attributes?.appStoreState,
  submissions: (subs2.data || []).map((s) => ({
    id: s.id,
    state: s.attributes?.state,
    submittedDate: s.attributes?.submittedDate
  }))
});
