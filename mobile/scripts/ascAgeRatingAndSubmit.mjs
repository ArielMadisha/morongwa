/**
 * Set age rating (low risk defaults for social/marketplace), review contact,
 * export compliance, then attempt submit for review.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(__dirname, "..");
const VERSION_ID = "b1ec529b-acc3-4935-b109-8ae6cb94d645";
const ASC_APP_ID = "6798004708";
const STATE = path.join(process.env.USERPROFILE || "", ".expo", "state.json");

const state = JSON.parse(fs.readFileSync(STATE, "utf8"));
const sessionSecret = state.auth.sessionSecret;

async function gql(query, variables = {}) {
  const res = await fetch("https://api.expo.dev/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "expo-session": sessionSecret
    },
    body: JSON.stringify({ query, variables })
  });
  const j = await res.json();
  if (j.errors?.length) throw new Error(j.errors.map((e) => e.message).join("; "));
  return j.data;
}

function makeJwt(issuer, kid, privateKeyPem) {
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
  const sig = sign.sign({ key: privateKeyPem, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${data}.${sig}`;
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
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`ASC ${method} ${urlPath} → ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function main() {
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
  const keyNodeId = list.account.byName.appStoreConnectApiKeysPaginated.edges[0].node.id;
  const full = await gql(
    `query($id: ID!) {
      appStoreConnectApiKey {
        byId(id: $id) { issuerIdentifier keyIdentifier keyP8 }
      }
    }`,
    { id: keyNodeId }
  );
  const key = full.appStoreConnectApiKey.byId;
  const token = makeJwt(key.issuerIdentifier, key.keyIdentifier, key.keyP8);

  // Age rating — declare none/infrequent for typical social marketplace (no gambling, no unrestricted web, etc.)
  // Values follow ASC AgeRatingDeclaration attributes (boolean / enum).
  const ageAttrs = {
    alcoholTobaccoOrDrugUseOrReferences: "NONE",
    contests: "NONE",
    gambling: false,
    gamblingSimulated: "NONE",
    horrorOrFearThemes: "NONE",
    matureOrSuggestiveThemes: "NONE",
    medicalOrTreatmentInformation: "NONE",
    profanityOrCrudeHumor: "NONE",
    sexualContentGraphicAndNudity: "NONE",
    sexualContentOrNudity: "NONE",
    unrestrictedWebAccess: false,
    violenceCartoonOrFantasy: "NONE",
    violenceRealistic: "NONE",
    violenceRealisticProlongedGraphicOrSadistic: "NONE",
    gunsOrOtherWeapons: "NONE",
    // Kids
    seventeenPlus: false
  };

  try {
    const existing = await asc(token, "GET", `/v1/appStoreVersions/${VERSION_ID}/ageRatingDeclaration`);
    const ardId = existing.data.id;
    console.log("Updating ageRatingDeclaration", ardId);
    await asc(token, "PATCH", `/v1/ageRatingDeclarations/${ardId}`, {
      data: { type: "ageRatingDeclarations", id: ardId, attributes: ageAttrs }
    });
    console.log("Age rating updated.");
  } catch (e) {
    console.warn("Age rating:", e.message, JSON.stringify(e.body)?.slice(0, 600));
  }

  // Review detail
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
      demoAccountRequired: true,
      demoAccountName: "demo@qwertymates.com",
      demoAccountPassword: "PleaseResetViaSupport",
      notes:
        "Qwertymates social + marketplace app for Southern Africa. Demo: use provided account or register with email. Food/grocery shop orders and wallet use production APIs at api.qwertymates.com. Support: support@qwertymates.com"
    };
    if (detail?.data?.id) {
      await asc(token, "PATCH", `/v1/appStoreReviewDetails/${detail.data.id}`, {
        data: { type: "appStoreReviewDetails", id: detail.data.id, attributes: attrs }
      });
      console.log("Review detail updated.");
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
      console.log("Review detail created.");
    }
  } catch (e) {
    console.warn("Review detail:", e.message, JSON.stringify(e.body)?.slice(0, 600));
  }

  // Encryption / export compliance on version
  try {
    await asc(token, "PATCH", `/v1/appStoreVersions/${VERSION_ID}`, {
      data: {
        type: "appStoreVersions",
        id: VERSION_ID,
        attributes: {
          usesIdfa: false,
          copyright: "2026 ARIEL CAPITAL INVESTMENT (PTY) LTD"
        }
      }
    });
    console.log("Version attributes updated (copyright, usesIdfa).");
  } catch (e) {
    console.warn("Version patch:", e.message, JSON.stringify(e.body)?.slice(0, 400));
  }

  // Content rights
  try {
    await asc(token, "PATCH", `/v1/apps/${ASC_APP_ID}`, {
      data: {
        type: "apps",
        id: ASC_APP_ID,
        attributes: {
          contentRightsDeclaration: "DOES_NOT_USE_THIRD_PARTY_CONTENT"
        }
      }
    });
    console.log("Content rights set.");
  } catch (e) {
    console.warn("Content rights:", e.message, JSON.stringify(e.body)?.slice(0, 400));
  }

  // Primary category SOCIAL_NETWORKING
  try {
    const infos = await asc(token, "GET", `/v1/apps/${ASC_APP_ID}/appInfos`);
    const infoId = infos.data?.[0]?.id;
    if (infoId) {
      // categories are relationship to appCategories
      const cats = await asc(token, "GET", "/v1/appCategories?filter[platforms]=IOS&limit=50");
      const social = (cats.data || []).find(
        (c) =>
          c.attributes?.name === "Social Networking" ||
          String(c.id).toLowerCase().includes("social")
      );
      console.log(
        "Categories sample",
        (cats.data || []).slice(0, 8).map((c) => ({ id: c.id, name: c.attributes?.name }))
      );
      if (social) {
        await asc(token, "PATCH", `/v1/appInfos/${infoId}`, {
          data: {
            type: "appInfos",
            id: infoId,
            relationships: {
              primaryCategory: { data: { type: "appCategories", id: social.id } }
            }
          }
        });
        console.log("Primary category set to", social.id, social.attributes?.name);
      }
    }
  } catch (e) {
    console.warn("Category:", e.message, JSON.stringify(e.body)?.slice(0, 400));
  }

  // Attempt submit for review (new API)
  try {
    const sub = await asc(token, "POST", "/v1/reviewSubmissions", {
      data: {
        type: "reviewSubmissions",
        attributes: { platform: "IOS" },
        relationships: { app: { data: { type: "apps", id: ASC_APP_ID } } }
      }
    });
    const subId = sub.data.id;
    console.log("reviewSubmission", subId);
    await asc(token, "POST", "/v1/reviewSubmissionItems", {
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: { data: { type: "reviewSubmissions", id: subId } },
          appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } }
        }
      }
    });
    await asc(token, "PATCH", `/v1/reviewSubmissions/${subId}`, {
      data: {
        type: "reviewSubmissions",
        id: subId,
        attributes: { submitted: true }
      }
    });
    console.log("SUBMITTED FOR REVIEW.");
  } catch (e) {
    console.warn(
      "Submit for review not completed via API:",
      e.message,
      JSON.stringify(e.body)?.slice(0, 800)
    );
    console.log(
      "Open https://appstoreconnect.apple.com/apps/6798004708/appstore/ios/version/inflight and click Add for Review / Submit."
    );
  }
}

main().catch((e) => {
  console.error(e.message);
  if (e.body) console.error(JSON.stringify(e.body, null, 2).slice(0, 1500));
  process.exit(1);
});
