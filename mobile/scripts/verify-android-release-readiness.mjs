#!/usr/bin/env node
/**
 * Pre-flight for Android Play release (blank-screen fix v1.3.4 + June backlog).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, "..");

let exit = 0;
const ok = (m) => console.log("OK:", m);
const fail = (m) => {
  console.error("FAIL:", m);
  exit = 1;
};

console.log("Qwertymates — Android release readiness (blank-screen fix + June backlog)\n");

const appJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, "app.json"), "utf8"));
const version = appJson?.expo?.version;
if (version === "1.3.4" || version === "1.3.3" || version === "1.3.2" || version === "1.3.1") ok(`app.json version ${version}`);
else fail(`app.json version expected 1.3.4 (or 1.3.1–1.3.3), got ${version}`);

const pluginPath = path.join(mobileRoot, "plugins", "withAndroidDeviceCompatibility.js");
if (fs.existsSync(pluginPath)) ok("withAndroidDeviceCompatibility.js present");
else fail("missing withAndroidDeviceCompatibility.js");

const plugins = appJson?.expo?.plugins || [];
const hasCompat = plugins.some(
  (p) => p === "./plugins/withAndroidDeviceCompatibility.js" || p?.[0] === "./plugins/withAndroidDeviceCompatibility.js"
);
if (hasCompat) ok("app.json includes device compatibility plugin");
else fail("app.json missing withAndroidDeviceCompatibility plugin");

const signaling = fs.readFileSync(path.join(mobileRoot, "src/lib/callSignaling.ts"), "utf8");
if (signaling.includes('transports: ["polling", "websocket"]')) ok("callSignaling polling-first");
else fail("callSignaling.ts missing polling-first transports");

const statusItem = fs.readFileSync(path.join(mobileRoot, "src/lib/statusStripItem.ts"), "utf8");
if (statusItem.includes("posts?:") && statusItem.includes("postsForStatusItem")) ok("statusStripItem multi-post support");
else fail("statusStripItem.ts missing posts[] / postsForStatusItem");

const viewer = fs.readFileSync(path.join(mobileRoot, "src/components/StatusStoryViewer.tsx"), "utf8");
if (viewer.includes("postIndex") && viewer.includes("segmentCount")) ok("StatusStoryViewer multi-segment UI");
else fail("StatusStoryViewer.tsx missing multi-segment props");

const qLogo = path.join(mobileRoot, "assets/images/qwertymates-q-mark-official.png");
if (fs.existsSync(qLogo)) ok("official Q logo asset");
else fail("missing qwertymates-q-mark-official.png");

const isWin = process.platform === "win32";
const cmd = isWin ? "npm.cmd" : "npm";
const tc = spawnSync(cmd, ["run", "typecheck"], {
  cwd: mobileRoot,
  encoding: "utf8",
  shell: isWin,
});
if (tc.status === 0) ok("typecheck passed");
else {
  fail("typecheck failed");
  process.stderr.write(tc.stderr || "");
  process.stdout.write(tc.stdout || "");
}

const gp = spawnSync(cmd, ["run", "verify:google-play"], {
  cwd: mobileRoot,
  encoding: "utf8",
  shell: isWin,
});
if (gp.status === 0) ok("Google Play credentials");
else fail("verify:google-play failed — see output above");

console.log(exit === 0 ? "\nReady for EAS production build." : "\nFix failures before building.");
process.exit(exit);
