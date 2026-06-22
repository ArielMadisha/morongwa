#!/usr/bin/env node
/**
 * Write mobile/credentials.json for EAS profile "production-local" (credentialsSource: local).
 * Copies .jks → mobile/credentials/play-upload.jks when a source path is given, or uses the file already there.
 *
 * Secrets: process.env, then mobile/.env, then mobile/.env.signing (later files override; never commit real values).
 *
 * Usage (from mobile/):
 *   npm run prepare:android-play-upload -- "C:\path\to\upload.jks"
 *   npm run prepare:android-play-upload
 *     (uses existing credentials/play-upload.jks if present)
 */
import fs from "fs";
import path from "node:path";
import { fileURLToPath } from "url";
import { listKeystoreAliases } from "./lib/androidKeystoreAliases.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, "..");
const destKs = path.join(mobileRoot, "credentials", "play-upload.jks");
const destJson = path.join(mobileRoot, "credentials.json");
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

function assertAliasExists(keystorePath, storePass, alias) {
  const r = listKeystoreAliases(keystorePath, storePass);
  if (!r.ok) {
    const detail =
      typeof r.text === "string" && r.text.trim()
        ? r.text.trim().slice(0, 2000)
        : "No output from keytool (is JDK installed and on PATH? Set JAVA_HOME if needed.)";
    console.error(
      "keytool could not read the keystore. Usually: wrong KEYSTORE_PASSWORD, corrupt play-upload.jks, or keytool missing.\n\n" +
        detail +
        "\n\nFix KEYSTORE_PASSWORD in mobile/.env.signing (or .env), then run:\n" +
        "  npm run list:android-upload-keystore-aliases\n\n" +
        "Or list aliases manually (PowerShell, from mobile/):\n" +
        "  keytool -list -v -keystore .\\credentials\\play-upload.jks\n" +
        "  (you will be prompted for the keystore password; look for lines \"Alias name: ...\")\n"
    );
    process.exit(1);
  }
  if (!r.aliases.length) {
    console.error(
      "Could not parse any key aliases from keytool output. Install a JDK (keytool on PATH or JAVA_HOME),\n" +
        "  or run manually: keytool -list -v -keystore credentials/play-upload.jks\n"
    );
    process.exit(1);
  }
  if (!r.aliases.includes(alias)) {
    console.error(
      `KEY_ALIAS "${alias}" is not in this keystore.\n` +
        `  Found: ${r.aliases.join(", ")}\n` +
        "  KEY_ALIAS must be the keystore entry name (from keytool), not the Expo app display name \"Qwertymates\".\n" +
        "  Put secrets in mobile/.env.signing (recommended) or mobile/.env, then re-run this script.\n" +
        "  Or run: npm run list:android-upload-keystore-aliases\n"
    );
    process.exit(1);
  }
}

loadEnvFile(envPath);
loadEnvFile(envSigningPath);

const srcArg = process.argv[2];
const storePass = process.env.KEYSTORE_PASSWORD;
const alias = process.env.KEY_ALIAS;
const keyPass = process.env.KEY_PASSWORD || process.env.KEYSTORE_PASSWORD;

if (!storePass || !alias) {
  console.error(
    "Missing KEYSTORE_PASSWORD or KEY_ALIAS.\n" +
      "  Add them to mobile/.env and/or mobile/.env.signing (copy from .env.signing.example).\n" +
      "  Do not put secrets in .env.example or .env.signing.example — those are templates and may be committed.\n"
  );
  process.exit(1);
}

let src = srcArg;
if (src) {
  if (!fs.existsSync(src)) {
    console.error("Keystore not found:", src);
    process.exit(1);
  }
  fs.mkdirSync(path.join(mobileRoot, "credentials"), { recursive: true });
  fs.copyFileSync(src, destKs);
  console.log("Copied keystore →", destKs);
} else if (fs.existsSync(destKs)) {
  console.log("Using existing keystore at", destKs);
} else {
  console.error(
    'No keystore at credentials/play-upload.jks. Pass a source path:\n' +
      '  npm run prepare:android-play-upload -- "C:\\path\\to\\upload.jks"\n'
  );
  process.exit(1);
}

const creds = {
  android: {
    keystore: {
      keystorePath: "./credentials/play-upload.jks",
      keystorePassword: storePass,
      keyAlias: alias,
      keyPassword: keyPass,
    },
  },
};
assertAliasExists(destKs, storePass, alias);

fs.writeFileSync(destJson, JSON.stringify(creds, null, 2), "utf8");

console.log("Wrote:", destJson);
console.log("\nNext (from mobile/):");
console.log("  npx eas-cli credentials   → Android → production → Upload credentials from credentials.json to EAS");
console.log("  npm run build:android:production:local");
console.log("  npm run submit:android:production:by-build-id -- <BUILD_ID>");
console.log("    (use the build ID from the finished build page; do not use submit:android:production --latest unless");
console.log("     you know the latest Android build is the correct profile/signature)");
console.log("\nOr skip Expo upload and only use local signing for cloud build with profile production-local.");
