#!/usr/bin/env node
/**
 * Local checks before EAS Android submit. Does not call Google APIs.
 * Run from mobile/: node scripts/verify-google-play-prereqs.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, "..");
const saPath = path.join(mobileRoot, "credentials", "google-play-service-account.json");

let exit = 0;
console.log("Qwertymates — Google Play / EAS prereq check\n");

if (!fs.existsSync(saPath)) {
  console.error("MISSING:", saPath);
  console.error("  Add your Play Console service account JSON here (gitignored).");
  exit = 1;
} else {
  console.log("OK:      Service account file exists at credentials/google-play-service-account.json");
  try {
    const j = JSON.parse(fs.readFileSync(saPath, "utf8"));
    if (!j.client_email || !j.private_key) {
      console.error("INVALID: JSON missing client_email or private_key");
      exit = 1;
    } else {
      console.log("OK:      JSON has client_email:", j.client_email);
    }
  } catch (e) {
    console.error("INVALID: Could not parse JSON —", e?.message || e);
    exit = 1;
  }
}

const easPath = path.join(mobileRoot, "eas.json");
if (fs.existsSync(easPath)) {
  const eas = JSON.parse(fs.readFileSync(easPath, "utf8"));
  const prod = eas?.submit?.production?.android;
  const open = eas?.submit?.["open-testing"]?.android;
  console.log("\neas.json submit tracks:");
  console.log("  production:     ", prod?.track ?? "(missing)");
  console.log("  open-testing:   ", open?.track ?? "(missing)");
}

console.log("\nSigning must match Play upload certificate (see GOOGLE_PLAY_RELEASE.md).");
console.log("Compare EAS keystore SHA1 with Play Console → App integrity → Upload key certificate.\n");

process.exit(exit);
