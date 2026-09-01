#!/usr/bin/env node
/**
 * Pre-flight for iOS App Store release (privacy manifests, account deletion, listing assets).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, "..");
const repoRoot = path.join(mobileRoot, "..");

let exit = 0;
const ok = (m) => console.log("OK:", m);
const fail = (m) => {
  console.error("FAIL:", m);
  exit = 1;
};
const warn = (m) => console.warn("WARN:", m);

console.log("Qwertymates — iOS App Store release readiness\n");

const appJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, "app.json"), "utf8"));
const version = appJson?.expo?.version;
if (typeof version === "string" && /^1\.3\.\d+$/.test(version)) ok(`app.json version ${version}`);
else fail(`app.json version expected 1.3.x, got ${version}`);

const ios = appJson?.expo?.ios || {};
if (ios.bundleIdentifier === "com.qwertymates.app") ok("bundleIdentifier com.qwertymates.app");
else fail(`bundleIdentifier expected com.qwertymates.app, got ${ios.bundleIdentifier}`);

if (ios.supportsTablet === true) ok("supportsTablet true");
else fail("supportsTablet should be true");

if (ios.infoPlist?.ITSAppUsesNonExemptEncryption === false) ok("ITSAppUsesNonExemptEncryption false");
else fail("ITSAppUsesNonExemptEncryption must be false (or declare encryption)");

const requiredKeys = [
  "NSCameraUsageDescription",
  "NSMicrophoneUsageDescription",
  "NSPhotoLibraryUsageDescription",
  "NSPhotoLibraryAddUsageDescription",
  "NSLocationWhenInUseUsageDescription"
];
for (const key of requiredKeys) {
  if (typeof ios.infoPlist?.[key] === "string" && ios.infoPlist[key].length > 20) ok(`infoPlist ${key}`);
  else fail(`missing/short infoPlist ${key}`);
}

const apiTypes = ios.privacyManifests?.NSPrivacyAccessedAPITypes;
if (Array.isArray(apiTypes) && apiTypes.length >= 3) ok(`privacyManifests (${apiTypes.length} API types)`);
else fail("ios.privacyManifests.NSPrivacyAccessedAPITypes missing or incomplete");

const iosIcon = path.join(mobileRoot, "assets", "ios-icon.png");
if (fs.existsSync(iosIcon)) ok("assets/ios-icon.png present");
else fail("missing assets/ios-icon.png (copy from App Stores Graphics IOS logos)");

if (ios.icon === "./assets/ios-icon.png") ok("ios.icon points to ios-icon.png");
else fail("ios.icon should be ./assets/ios-icon.png");

const forceGate = fs.readFileSync(path.join(mobileRoot, "src/components/ForceUpdateGate.tsx"), "utf8");
if (forceGate.includes("ios-update-policy") && forceGate.includes('Platform.OS === "ios"')) {
  ok("ForceUpdateGate includes iOS App Store policy");
} else fail("ForceUpdateGate missing iOS update policy path");

const profile = fs.readFileSync(path.join(mobileRoot, "src/screens/ProfileScreen.tsx"), "utf8");
if (profile.includes("deleteAccount") && profile.includes("Delete my account")) {
  ok("ProfileScreen exposes account deletion");
} else fail("ProfileScreen missing in-app account deletion (Apple 5.1.1(v))");

const api = fs.readFileSync(path.join(mobileRoot, "src/lib/api.ts"), "utf8");
if (api.includes("deleteAccount:")) ok("usersAPI.deleteAccount present");
else fail("usersAPI.deleteAccount missing");

const home = fs.readFileSync(path.join(mobileRoot, "src/screens/HomeScreen.tsx"), "utf8");
const hub = fs.readFileSync(path.join(mobileRoot, "src/screens/HubScreen.tsx"), "utf8");
const modules = [
  ["QwertyWorld", home.includes("WorldScreen") && home.includes('"world"')],
  ["QwertyHub", home.includes("HubScreen")],
  ["Food/Groceries", hub.includes('"food"') && hub.includes('"groceries"')],
  ["MyStore", home.includes("Open MyStore") || home.includes("showMyStoreQuick")],
  ["Errands", home.includes("ErrandsScreen")],
  ["Cart", home.includes("CartScreen")],
  ["ACBPayWallet", home.includes("WalletScreen")],
  ["QwertyTV", home.includes("tvVideo") || home.includes('"tv"')],
  ["Morongwa messages", home.includes("MessagesScreen")],
  ["QwertyMusic", home.includes("MusicScreen")]
];
for (const [name, present] of modules) {
  if (present) ok(`feature wire: ${name}`);
  else fail(`feature wire missing: ${name}`);
}

const graphicsRoot = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".cursor",
  "projects",
  "App Stores Graphics",
  "IOS",
  "Qwertymates"
);
const listingDoc = path.join(graphicsRoot, "docs", "03-APP-STORE-LISTING.md");
const shot67 = path.join(graphicsRoot, "screenshots", "iphone-6-7");
if (fs.existsSync(listingDoc)) ok("App Store listing copy found (App Stores Graphics)");
else warn("listing copy not found at App Stores Graphics/IOS/Qwertymates/docs/03-APP-STORE-LISTING.md");
if (fs.existsSync(shot67)) ok("iPhone 6.7 screenshots folder present");
else warn("iPhone 6.7 screenshots folder missing — upload from App Stores Graphics before ASC submit");

const docsChecklist = path.join(repoRoot, "DOCS", "IOS_APP_STORE_CHECKLIST.md");
if (fs.existsSync(docsChecklist)) ok("DOCS/IOS_APP_STORE_CHECKLIST.md present");
else warn("DOCS/IOS_APP_STORE_CHECKLIST.md missing");

const easJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, "eas.json"), "utf8"));
const iosSubmit = easJson?.submit?.production?.ios;
if (iosSubmit && (iosSubmit.ascAppId || iosSubmit.appleId || iosSubmit.appleTeamId)) {
  ok("eas.json submit.production.ios has ASC identifiers");
} else {
  warn(
    "eas.json submit.production.ios missing ascAppId/appleTeamId — configure after ASC app record + API key (see DOCS/IOS_APP_STORE_CHECKLIST.md)"
  );
}

const isWin = process.platform === "win32";
const cmd = isWin ? "npm.cmd" : "npm";
const tc = spawnSync(cmd, ["run", "typecheck"], {
  cwd: mobileRoot,
  encoding: "utf8",
  shell: isWin
});
if (tc.status === 0) ok("typecheck passed");
else {
  fail("typecheck failed");
  process.stderr.write(tc.stderr || "");
  process.stdout.write(tc.stdout || "");
}

console.log(
  exit === 0
    ? "\nReady for EAS iOS production build (Apple credentials still required on EAS)."
    : "\nFix failures before building."
);
process.exit(exit);
