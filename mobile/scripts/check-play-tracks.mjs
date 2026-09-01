/**
 * List Google Play tracks for com.qwertymates using the local service account.
 * Usage: node scripts/check-play-tracks.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createSign } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keyPath = path.join(__dirname, "..", "credentials", "google-play-service-account.json");
const pkg = "com.qwertymates";
const scope = "https://www.googleapis.com/auth/androidpublisher";

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getAccessToken(key) {
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
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  const sig = b64url(sign.sign(key.private_key));
  const jwt = `${unsigned}.${sig}`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json.access_token;
}

async function main() {
  const key = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  const token = await getAccessToken(key);
  const headers = { Authorization: `Bearer ${token}` };

  const editRes = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/edits`,
    { method: "POST", headers, body: "{}" }
  );
  const edit = await editRes.json();
  if (!editRes.ok) throw new Error(JSON.stringify(edit));
  const editId = edit.id;

  const tracksRes = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/edits/${editId}/tracks`,
    { headers }
  );
  const tracks = await tracksRes.json();
  console.log(JSON.stringify(tracks, null, 2));

  await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/edits/${editId}`,
    { method: "DELETE", headers }
  ).catch(() => {});
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
