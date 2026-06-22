#!/usr/bin/env node
/**
 * Local checks before building for Huawei AppGallery (manual upload).
 * Run from mobile/: node scripts/verify-huawei-prereqs.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, "..");

let exit = 0;
console.log("Qwertymates — Huawei AppGallery / EAS prereq check\n");

const appJsonPath = path.join(mobileRoot, "app.json");
if (!fs.existsSync(appJsonPath)) {
  console.error("MISSING:", appJsonPath);
  exit = 1;
} else {
  try {
    const app = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
    const pkg = app?.expo?.android?.package;
    const ver = app?.expo?.version;
    if (!pkg) {
      console.error("MISSING: expo.android.package in app.json");
      exit = 1;
    } else {
      console.log("OK:      Android package:", pkg);
    }
    if (!ver) {
      console.error("MISSING: expo.version in app.json");
      exit = 1;
    } else {
      console.log("OK:      App version:", ver);
    }
  } catch (e) {
    console.error("INVALID: app.json —", e?.message || e);
    exit = 1;
  }
}

const easPath = path.join(mobileRoot, "eas.json");
if (!fs.existsSync(easPath)) {
  console.error("MISSING:", easPath);
  exit = 1;
} else {
  try {
    const eas = JSON.parse(fs.readFileSync(easPath, "utf8"));
    const huawei = eas?.build?.huawei;
    if (!huawei) {
      console.error('MISSING: eas.json build profile "huawei"');
      exit = 1;
    } else {
      console.log("OK:      eas.json has build profile: huawei");
      console.log("         android.buildType:", huawei?.android?.buildType ?? "(inherits production)");
    }
  } catch (e) {
    console.error("INVALID: eas.json —", e?.message || e);
    exit = 1;
  }
}

console.log("\nNotes:");
console.log("  • Huawei upload is manual in AppGallery Connect (EAS has no Huawei submit target).");
console.log("  • Use the same upload keystore as Google Play if the package id matches (typical).");
console.log("  • Devices without Google Mobile Services: push/maps may need HMS later; core app is API-based.\n");

process.exit(exit);
