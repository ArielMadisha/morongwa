#!/usr/bin/env node
/**
 * Run full Play release when Expo quota is open.
 * Window: quotaOpenDate → retryUntil (from state, defaults 2026-08-01 … 2026-08-07 inclusive).
 * Used by Windows scheduled task and: npm run release:android:play:quota-resume
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, "..");
const statePath = path.join(mobileRoot, "exports", "eas-android-release-state.json");
const logPath = path.join(mobileRoot, "exports", "eas-android-release-task.log");

const DEFAULT_QUOTA_OPEN_DATE = "2026-08-01";
const DEFAULT_RETRY_UNTIL_INCLUSIVE = "2026-08-07";

function log(line) {
  const ts = new Date().toISOString();
  const msg = `[${ts}] ${line}`;
  console.log(msg);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, msg + "\n", "utf8");
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return {};
  }
}

function writeState(patch) {
  const next = { ...readState(), ...patch, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(next, null, 2) + "\n", "utf8");
}

/** Local calendar day (owner PC / SAST) — avoid UTC midnight skew. */
function ymd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayAfter(ymdInclusive) {
  const d = new Date(`${ymdInclusive}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return ymd(d);
}

function runNpm(script, extraArgs = []) {
  const isWin = process.platform === "win32";
  const cmd = isWin ? "npm.cmd" : "npm";
  const res = spawnSync(cmd, ["run", script, ...extraArgs], {
    cwd: mobileRoot,
    encoding: "utf8",
    env: { ...process.env, EAS_NO_VCS: "1" },
    shell: isWin,
  });
  const out = `${res.stdout || ""}${res.stderr || ""}`;
  return { code: res.status ?? 1, out };
}

const state = readState();
const QUOTA_OPEN_DATE = state.quotaOpenDate || DEFAULT_QUOTA_OPEN_DATE;
const RETRY_UNTIL_EXCLUSIVE = dayAfter(state.retryUntil || DEFAULT_RETRY_UNTIL_INCLUSIVE);

const today = ymd();
if (today < QUOTA_OPEN_DATE) {
  log(`SKIP: before quota open date (${QUOTA_OPEN_DATE}). Today=${today}`);
  process.exit(0);
}
if (today >= RETRY_UNTIL_EXCLUSIVE) {
  log(`SKIP: past retry window (until ${state.retryUntil || DEFAULT_RETRY_UNTIL_INCLUSIVE}). Manual release required.`);
  process.exit(0);
}

if (state.completedAt) {
  log(`SKIP: already completed at ${state.completedAt}`);
  process.exit(0);
}

log("=== EAS Android Play release (quota resume) ===");

const verify = runNpm("verify:android-release-readiness");
if (verify.code !== 0) {
  log("FAIL: verify:android-release-readiness\n" + verify.out);
  writeState({ lastAttemptAt: new Date().toISOString(), lastAttemptResult: "verify_failed" });
  process.exit(1);
}

writeState({ lastAttemptAt: new Date().toISOString(), lastAttemptResult: "building" });

const build = runNpm("build:android:production");
const buildOut = build.out || "";

if (build.code !== 0) {
  const quota =
    /free plan this month|builds from the Free plan|quota/i.test(buildOut);
  log("FAIL: build:android:production\n" + buildOut);
  writeState({
    lastAttemptAt: new Date().toISOString(),
    lastAttemptResult: quota ? "quota_blocked" : "build_failed",
  });
  process.exit(quota ? 2 : 1);
}

const idMatch =
  buildOut.match(/https:\/\/expo\.dev\/accounts\/[^\s]+\/builds\/([a-f0-9-]+)/i) ||
  buildOut.match(/Build ID:\s*([a-f0-9-]+)/i);
const buildId = idMatch?.[1];
if (!buildId) {
  log("FAIL: build succeeded but could not parse build id\n" + buildOut);
  writeState({ lastAttemptAt: new Date().toISOString(), lastAttemptResult: "build_id_missing" });
  process.exit(1);
}

log(`OK: EAS build id ${buildId}`);
writeState({ easBuildId: buildId, lastAttemptResult: "submitting" });

const submit = runNpm("submit:android:production:by-build-id", ["--", buildId]);
const submitOut = submit.out || "";
if (submit.code !== 0) {
  log("FAIL: submit\n" + submitOut);
  writeState({
    lastAttemptAt: new Date().toISOString(),
    lastAttemptResult: "submit_failed",
    easBuildId: buildId,
  });
  process.exit(1);
}

const playUrl = submitOut.match(/https:\/\/play\.google\.com\/[^\s]+/)?.[0] || null;
log("SUCCESS: Play submit completed");
if (playUrl) log(`Play: ${playUrl}`);

writeState({
  completedAt: new Date().toISOString(),
  lastAttemptResult: "success",
  easBuildId: buildId,
  playSubmissionUrl: playUrl,
});

process.exit(0);
