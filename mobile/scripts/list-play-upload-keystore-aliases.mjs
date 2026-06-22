#!/usr/bin/env node
/**
 * List entry aliases in mobile/credentials/play-upload.jks (needs store password).
 * Use the printed alias as KEY_ALIAS in .env.signing (recommended) or .env.
 *
 * Usage (from mobile/):
 *   npm run list:android-upload-keystore-aliases
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";
import { listKeystoreAliases } from "./lib/androidKeystoreAliases.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, "..");
const destKs = path.join(mobileRoot, "credentials", "play-upload.jks");
const envPath = path.join(mobileRoot, ".env");
const envSigningPath = path.join(mobileRoot, ".env.signing");

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

loadEnvFile(envPath);
loadEnvFile(envSigningPath);

const password = process.env.KEYSTORE_PASSWORD;
if (!password) {
  console.error("Set KEYSTORE_PASSWORD in mobile/.env.signing (recommended) or mobile/.env first.\n");
  process.exit(1);
}
if (!fs.existsSync(destKs)) {
  console.error(
    "Keystore not found:",
    destKs,
    '\nRun: npm run prepare:android-play-upload -- "C:\\path\\to\\upload.jks"\n'
  );
  process.exit(1);
}

const r = listKeystoreAliases(destKs, password);
if (!r.ok) {
  const detail =
    typeof r.text === "string" && r.text.trim()
      ? r.text.trim()
      : "No output from keytool (install JDK / set JAVA_HOME, or fix KEYSTORE_PASSWORD).";
  console.error(detail + "\n");
  console.error(
    "If the password is wrong, fix KEYSTORE_PASSWORD in .env.signing then retry.\n" +
      "Manual list (prompts for password — no echo in storepass on CLI):\n" +
      "  keytool -list -v -keystore .\\credentials\\play-upload.jks\n"
  );
  process.exit(1);
}

if (r.text) console.log(r.text);
if (r.aliases.length) {
  console.log("\nUse one of these exactly as KEY_ALIAS (not the Expo app name unless it matches):");
  console.log("  " + r.aliases.join(", "));
  console.log("\nThen: npm run prepare:android-play-upload\n");
} else {
  console.error("\nCould not parse alias names; see keytool output above.\n");
  process.exit(1);
}
