/**
 * One-shot live ASC status for Qwertymates-family iOS apps (no secrets printed).
 * Usage: node scripts/ascFamilyStatusReport.mjs
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";

const APPS = [
  { name: "Qwertymates", id: "6798004708", bundle: "com.qwertymates.app" },
  { name: "Qwertymates.com (Convertify)", id: "6443939965", bundle: "?" },
  { name: "ACBPay / Acbpay", id: "1600228324", bundle: "com.online.Acbpay" },
  { name: "QwertyHub", id: "6800961337", bundle: "com.qwertyhub.app" }
];

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

async function asc(token, urlPath) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${urlPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  return { status: res.status, json: await res.json() };
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

// Also list all apps on the account for Ask MacGyver / Messenger discovery
const allApps = await asc(token, `/v1/apps?limit=50`);
const accountApps = (allApps.json?.data || []).map((a) => ({
  id: a.id,
  name: a.attributes?.name,
  bundleId: a.attributes?.bundleId,
  sku: a.attributes?.sku
}));

const out = { generatedAt: new Date().toISOString(), accountApps, apps: [] };

for (const app of APPS) {
  const meta = await asc(token, `/v1/apps/${app.id}`);
  const versions = await asc(
    token,
    `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10`
  );
  const subs = await asc(
    token,
    `/v1/apps/${app.id}/reviewSubmissions?filter[platform]=IOS&limit=8`
  );
  const builds = await asc(
    token,
    `/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=8&include=preReleaseVersion`
  );

  const privacy = await asc(
    token,
    `/v1/apps/${app.id}/appPrivacyDetails?limit=5`
  ).catch(() => ({ status: 0, json: {} }));

  // Try privacy declarations endpoint variants
  const privacyPubs = await asc(
    token,
    `/v1/apps/${app.id}?include=appStoreVersions`
  );

  let buildDetails = [];
  for (const b of builds.json?.data || []) {
    const verRel = (builds.json?.included || []).find(
      (i) =>
        i.type === "preReleaseVersions" &&
        i.id === b.relationships?.preReleaseVersion?.data?.id
    );
    buildDetails.push({
      id: b.id,
      version: verRel?.attributes?.version,
      buildNumber: b.attributes?.version,
      processingState: b.attributes?.processingState,
      uploadedDate: b.attributes?.uploadedDate
    });
  }

  // For latest version, try get build relationship + privacy publish state via appInfo
  const latestVer = (versions.json?.data || [])[0];
  let buildForLatest = null;
  let privacyState = null;
  if (latestVer?.id) {
    const bRel = await asc(
      token,
      `/v1/appStoreVersions/${latestVer.id}/build`
    );
    buildForLatest = bRel.json?.data
      ? {
          id: bRel.json.data.id,
          buildNumber: bRel.json.data.attributes?.version,
          processingState: bRel.json.data.attributes?.processingState
        }
      : null;

    // App privacy / age rating via appStoreVersion submission readiness isn't always exposed;
    // check appInfos for privacy policy URL presence
    const infos = await asc(token, `/v1/apps/${app.id}/appInfos?limit=5`);
    const infoId = infos.json?.data?.[0]?.id;
    if (infoId) {
      const locs = await asc(
        token,
        `/v1/appInfos/${infoId}/appInfoLocalizations?limit=5`
      );
      privacyState = {
        privacyPolicyUrl: locs.json?.data?.[0]?.attributes?.privacyPolicyUrl || null,
        name: locs.json?.data?.[0]?.attributes?.name || null
      };
    }
  }

  // App Privacy (nutrition labels) — try appDataUsages
  const dataUsages = await asc(
    token,
    `/v1/apps/${app.id}/dataUsagePublished?limit=1`
  ).catch(() => ({ status: 404, json: {} }));

  const row = {
    name: app.name,
    id: app.id,
    expectedBundle: app.bundle,
    ascName: meta.json?.data?.attributes?.name,
    ascBundleId: meta.json?.data?.attributes?.bundleId,
    versions: (versions.json?.data || []).map((v) => ({
      id: v.id,
      versionString: v.attributes?.versionString,
      state: v.attributes?.appStoreState,
      createdDate: v.attributes?.createdDate,
      releaseType: v.attributes?.releaseType
    })),
    submissions: (subs.json?.data || []).map((s) => ({
      id: s.id,
      state: s.attributes?.state,
      submittedDate: s.attributes?.submittedDate
    })),
    recentBuilds: buildDetails,
    buildAttachedToLatestVersion: buildForLatest,
    listingPrivacy: privacyState,
    dataUsageProbe: {
      status: dataUsages.status,
      err: dataUsages.json?.errors?.[0]?.code || null
    },
    privacyDetailsProbe: {
      status: privacy.status,
      err: privacy.json?.errors?.[0]?.code || null
    }
  };
  out.apps.push(row);
}

// Extra: search account apps for MacGyver / Messenger
out.macgyverMessengerCandidates = accountApps.filter((a) =>
  /macgyver|messenger|morongwa|qwerty/i.test(`${a.name} ${a.bundleId} ${a.sku}`)
);

console.log(JSON.stringify(out, null, 2));
