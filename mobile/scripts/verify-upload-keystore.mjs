#!/usr/bin/env node
/**
 * Compare a local .jks SHA1 to what Google Play expects (upload key) and to the last known EAS default.
 *
 * Usage (from mobile/):
 *   set KEYSTORE_PASSWORD=your-store-password
 *   node ./scripts/verify-upload-keystore.mjs "C:\path\to\upload.jks" YOUR_ALIAS
 *
 * On Windows PowerShell:
 *   $env:KEYSTORE_PASSWORD = "your-store-password"
 *   node ./scripts/verify-upload-keystore.mjs "C:\path\to\upload.jks" YOUR_ALIAS
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";
import { findKeytool, runKeytool, stdioText } from "./lib/androidKeystoreAliases.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (k) process.env[k] = v;
  }
}

loadEnvFile(path.join(mobileRoot, ".env"));
loadEnvFile(path.join(mobileRoot, ".env.signing"));

const PLAY_EXPECTED_SHA1 =
  "AC:35:AC:B7:2E:34:57:56:78:C3:BB:24:39:A7:FC:9C:A2:94:D3:B1".replace(/:/g, "").toUpperCase();
const EAS_DEFAULT_SHA1 =
  "9D:A8:32:D4:72:78:36:FA:1C:69:B5:CE:FC:BB:F5:64:37:D5:1D:3B".replace(/:/g, "").toUpperCase();

function normSha1(s) {
  return String(s || "")
    .replace(/:/g, "")
    .replace(/\s/g, "")
    .toUpperCase();
}

const keystorePath = process.argv[2] || path.join(mobileRoot, "credentials", "play-upload.jks");
const alias = process.argv[3] || process.env.KEY_ALIAS || "upload";
const password = process.env.KEYSTORE_PASSWORD;

if (!password) {
  console.error(
    "Set KEYSTORE_PASSWORD in mobile/.env.signing (recommended) or mobile/.env first.\n"
  );
  process.exit(1);
}
if (!password) {
  console.error("Set environment variable KEYSTORE_PASSWORD to the keystore password first.\n");
  process.exit(1);
}
if (!fs.existsSync(keystorePath)) {
  console.error("File not found:", keystorePath);
  process.exit(1);
}

const keytool = findKeytool();
const args = ["-list", "-v", "-keystore", keystorePath, "-alias", alias, "-storepass", password];
const result = runKeytool(keytool, args);

if (result.status !== 0) {
  console.error(stdioText(result) || "keytool failed");
  process.exit(result.status ?? 1);
}

const text = stdioText(result);
const m = text.match(/SHA1:\s*([0-9A-Fa-f:]+)/);
if (!m) {
  console.error("Could not parse SHA1 from keytool output. Raw output:\n", text.slice(0, 2000));
  process.exit(1);
}

const sha1 = normSha1(m[1]);
const pretty = m[1].trim();

console.log("\nKeystore file:", keystorePath);
console.log("Alias:", alias);
console.log("SHA1 (this file):", pretty, "\n");

if (sha1 === normSha1(PLAY_EXPECTED_SHA1)) {
  console.log("MATCH: This keystore matches Google Play’s **current** upload certificate (AC:35…).");
  console.log("Next: Upload this same keystore to Expo → Android → production (eas credentials or dashboard),");
  console.log("then run: npm run build:android:production && npm run submit:android:production\n");
} else if (sha1 === normSha1(EAS_DEFAULT_SHA1)) {
  console.log("MATCH: This is the same SHA1 as Expo’s **default** EAS keystore (9D:A8…).");
  console.log("Play still expects AC:35… → either upload the **old** upload keystore to Expo, or complete");
  console.log("Play Console **upload key reset** so Google expects 9D:A8… instead.\n");
} else {
  console.log("This SHA1 does not match the known Play (AC:35…) or last EAS default (9D:A8…).");
  console.log("Compare manually with Play Console → App integrity → Upload key certificate.\n");
}
