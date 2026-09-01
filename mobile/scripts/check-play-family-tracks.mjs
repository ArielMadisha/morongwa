/**
 * List Play tracks for Qwertymates-family packages (no secrets printed).
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keyPath = path.join(__dirname, "..", "credentials", "google-play-service-account.json");
const key = JSON.parse(fs.readFileSync(keyPath, "utf8"));
const scope = "https://www.googleapis.com/auth/androidpublisher";

const PACKAGES = [
  "com.qwertymates",
  "com.acbpay.wallet",
  "com.qwertyhub.app",
  "com.qwertymates.askmacgyver",
  "com.online.Acbpay",
  "com.qwertymates.messenger",
  "com.morongwa.app",
  "com.morongwa.messenger"
];

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    })
  );
  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = b64url(signer.sign(key.private_key));
  const jwt = `${unsigned}.${signature}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`token failed: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function listTracks(token, pkg) {
  const editRes = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/edits`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{}"
    }
  );
  const editJson = await editRes.json();
  if (!editRes.ok) {
    return { package: pkg, error: editJson.error || editJson, status: editRes.status };
  }
  const editId = editJson.id;
  const tracksRes = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/edits/${editId}/tracks`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const tracksJson = await tracksRes.json();
  await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/edits/${editId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  ).catch(() => {});

  // Also try app details
  let details = null;
  try {
    const d = await fetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    details = { status: d.status, body: await d.json() };
  } catch (e) {
    details = { error: String(e) };
  }

  return {
    package: pkg,
    status: tracksRes.status,
    tracks: (tracksJson.tracks || []).map((t) => ({
      track: t.track,
      releases: (t.releases || []).map((r) => ({
        name: r.name,
        status: r.status,
        userFraction: r.userFraction,
        versionCodes: r.versionCodes,
        releaseNotes: (r.releaseNotes || []).slice(0, 1).map((n) => n.text?.slice(0, 80))
      }))
    })),
    detailsSummary: details?.body?.error
      ? { error: details.body.error.message || details.body.error }
      : details?.body
        ? {
            title: details.body.title,
            defaultLanguage: details.body.defaultLanguage,
            contactEmail: details.body.contactEmail ? "(set)" : null
          }
        : null
  };
}

const token = await getAccessToken();
const out = [];
for (const pkg of PACKAGES) {
  const row = await listTracks(token, pkg);
  out.push(row);
  console.log(JSON.stringify(row, null, 2));
}
fs.writeFileSync(
  path.join(__dirname, "..", "exports", "play-family-tracks-status.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), apps: out }, null, 2)
);
