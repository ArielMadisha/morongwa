/**
 * Import exactly one school photo folder per calendar day from a local root directory.
 *
 * NON-NEGOTIABLE owner policy (see .cursor/rules/recurring-owner-schedules.mdc):
 * - One school per calendar day — same standing as World News sports Tue/Fri posts.
 * - Do not batch multiple schools; do not remove lastRunDate guard.
 *
 * Policy (see .cursor/rules/school-gallery-daily-import.mdc):
 * - One school folder per day; never re-import a folder that already succeeded.
 * - Match existing Qwertymates school account → append photos (--append).
 * - No account but folder has photos → create school account and load photos.
 *
 * From backend/:
 *   npm run school:import-gallery-daily -- --dry-run
 *   npm run school:import-gallery-daily
 *   npm run school:import-gallery-daily -- --count=5   (owner override — rare batch day only)
 *
 * Default is exactly one school per calendar day. --count=N (>1) is an explicit owner batch override.
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { spawn, spawnSync, execSync } from "child_process";
import { listSchoolGallerySourceFolders, resolveSchoolGalleryFolderPath } from "./lib/schoolGalleryFiles";
import { cleanFolderLabel, matchKey } from "./lib/schoolNameMatching";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const FORCE = args.includes("--force");

function argValue(prefix: string): string | undefined {
  const hit = args.find((a) => a.startsWith(prefix));
  if (!hit) return undefined;
  const rest = hit.slice(prefix.length).trim();
  if (rest) return rest;
  const i = args.indexOf(hit);
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

const DEFAULT_ROOT =
  process.env.SCHOOL_GALLERY_IMPORT_ROOT ||
  "C:\\Users\\Dell\\OneDrive - Bonakude Consulting PTY LTD\\Documents\\Coding\\Schools";

const ROOT = (argValue("--root=") || DEFAULT_ROOT).trim();
const COUNTRY = (argValue("--country=") || process.env.SCHOOL_GALLERY_IMPORT_COUNTRY || "ZA").trim();
const STATE_PATH = path.resolve(
  __dirname,
  "../exports",
  (argValue("--state=") || "school-gallery-daily-state.json").replace(/^[/\\]+/, "")
);
const CATALOG_PATH = path.resolve(__dirname, "../exports/school-gallery-folder-catalog.json");
const REFRESH_CATALOG = args.includes("--refresh-catalog");
const REQUESTED_COUNT = Math.max(
  1,
  Math.min(20, parseInt(argValue("--count=") || "1", 10) || 1)
);
/** Default 1/day; owner may pass --count=N for an exceptional batch (e.g. 5 schools one day). */
const SCHOOLS_PER_RUN = REQUESTED_COUNT;
const BATCH_OVERRIDE = REQUESTED_COUNT > 1;

const SUCCESS_STATUSES = new Set(["imported", "dry_run_ok", "would_create_user"]);
const SKIP_STATUSES = new Set(["skip_not_school_name", "skip_no_images", "no_match", "ambiguous"]);
const MAX_SKIP_ATTEMPTS = 40;

type DailyState = {
  root: string;
  country: string;
  nextOffset: number;
  lastRunDate: string | null;
  lastFolder: string | null;
  lastStatus: string | null;
  totalRuns: number;
  /** Folder keys already imported — prevents repeating the same school folder. */
  processedFolderKeys: string[];
  history: Array<{
    date: string;
    offset: number;
    folder: string;
    status: string;
    reportFile?: string;
    userId?: string;
  }>;
};

function folderStateKey(folderName: string): string {
  const label = cleanFolderLabel(folderName);
  return matchKey(label) || label.toLowerCase();
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function sleepSeconds(sec: number) {
  if (sec <= 0) return;
  try {
    execSync(`ping -n ${sec + 1} 127.0.0.1`, { stdio: "ignore", shell: true });
  } catch {
    /* ignore */
  }
}

function successHistoryKeys(history: DailyState["history"]): string[] {
  return history
    .filter((h) => SUCCESS_STATUSES.has(h.status) && h.folder)
    .map((h) => folderStateKey(h.folder));
}

function loadState(): DailyState {
  const empty: DailyState = {
    root: ROOT,
    country: COUNTRY,
    nextOffset: 0,
    lastRunDate: null,
    lastFolder: null,
    lastStatus: null,
    totalRuns: 0,
    processedFolderKeys: [],
    history: [],
  };
  if (!fs.existsSync(STATE_PATH)) return empty;
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) as DailyState;
    const history = Array.isArray(raw.history) ? raw.history.slice(-500) : [];
    const processedFolderKeys = Array.isArray(raw.processedFolderKeys)
      ? raw.processedFolderKeys.map(String)
      : successHistoryKeys(history);
    return {
      root: ROOT,
      country: COUNTRY,
      nextOffset: Math.max(0, Number(raw.nextOffset) || 0),
      lastRunDate: raw.lastRunDate || null,
      lastFolder: raw.lastFolder || null,
      lastStatus: raw.lastStatus || null,
      totalRuns: Math.max(0, Number(raw.totalRuns) || 0),
      processedFolderKeys: [...new Set(processedFolderKeys)],
      history,
    };
  } catch {
    return empty;
  }
}

function saveState(state: DailyState) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function buildProcessedFolderSet(state: DailyState): Set<string> {
  return new Set([...state.processedFolderKeys, ...successHistoryKeys(state.history)]);
}

type BatchRunResult = {
  exitCode: number;
  folderName: string;
  status: string;
  userId?: string;
  reportFile?: string;
};

function latestBatchReportSince(sinceMs: number): string | undefined {
  const dir = path.resolve(__dirname, "../exports");
  if (!fs.existsSync(dir)) return undefined;
  let best: { path: string; mtime: number } | null = null;
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith("school-gallery-batch-import-") || !f.endsWith(".json")) continue;
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.mtimeMs >= sinceMs && (!best || st.mtimeMs > best.mtime)) {
      best = { path: p, mtime: st.mtimeMs };
    }
  }
  return best?.path;
}

function runBatchForFolder(folderAbsPath: string): BatchRunResult {
  let folderName = path.basename(folderAbsPath);
  const batchArgs = [
    "tsx",
    path.join("scripts", "importSchoolGalleriesBatchFromDir.ts"),
    `--country=${COUNTRY}`,
    "--append",
  ];
  if (DRY) batchArgs.push("--dry-run");

  const startedMs = Date.now() - 2000;
  const child = spawnSync("npx", batchArgs, {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    shell: true,
    stdio: "inherit",
    env: {
      ...process.env,
      SCHOOL_GALLERY_IMPORT_ROOT: ROOT,
      SCHOOL_GALLERY_IMPORT_FOLDER: folderName,
    },
  });

  const reportFile = latestBatchReportSince(startedMs);

  let status = child.status === 0 ? "completed" : `exit_${child.status ?? "unknown"}`;
  let userId: string | undefined;

  if (reportFile && fs.existsSync(reportFile)) {
    try {
      const report = JSON.parse(fs.readFileSync(reportFile, "utf8")) as {
        entries?: Array<{ folder?: string; status?: string; userId?: string }>;
      };
      const entry = report.entries?.[0];
      if (entry?.folder) folderName = String(entry.folder);
      if (entry?.status) status = String(entry.status);
      if (entry?.userId) userId = String(entry.userId);
    } catch {
      /* ignore parse errors */
    }
  }

  return {
    exitCode: child.status ?? 1,
    folderName,
    status,
    userId,
    reportFile,
  };
}

function loadOrBuildFolderCatalog(root: string): string[] {
  if (!REFRESH_CATALOG && fs.existsSync(CATALOG_PATH)) {
    try {
      const cat = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8")) as { root?: string; folders?: string[] };
      if (cat.root === root && Array.isArray(cat.folders) && cat.folders.length) {
        console.log(`Folder catalog: ${cat.folders.length} schools (cached ${CATALOG_PATH})`);
        return cat.folders.map(String);
      }
    } catch {
      /* rebuild */
    }
  }
  console.log("Building school folder catalog (OneDrive scan — runs once, then cached)...");
  const abs = listSchoolGallerySourceFolders(root);
  const names = abs.map((p) => path.basename(p));
  fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true });
  fs.writeFileSync(
    CATALOG_PATH,
    JSON.stringify({ root, builtAt: new Date().toISOString(), folders: names }, null, 2),
    "utf8"
  );
  console.log(`Folder catalog saved: ${names.length} schools`);
  return names;
}

function folderAbsPath(root: string, folderName: string): string | null {
  return resolveSchoolGalleryFolderPath(root, folderName);
}

function main() {
  if (!fs.existsSync(ROOT) || !fs.statSync(ROOT).isDirectory()) {
    console.error(`Schools root not found: ${ROOT}`);
    process.exit(1);
  }

  const state = loadState();
  const today = todayKey();
  const folderNames = loadOrBuildFolderCatalog(ROOT);
  const totalFolders = folderNames.length;
  const processedFolders = buildProcessedFolderSet(state);

  const successesToday = state.history.filter(
    (h) => h.date === today && SUCCESS_STATUSES.has(h.status)
  );
  const successesTodayCount = successesToday.length;

  if (!BATCH_OVERRIDE && successesTodayCount > 0) {
    const last = successesToday[successesToday.length - 1];
    console.log(
      `One school per day policy: already imported today (${today}) — ${last?.folder || state.lastFolder || "—"}.`
    );
    console.log(`Next offset: ${state.nextOffset}. No second school until tomorrow.`);
    process.exit(0);
  }

  if (BATCH_OVERRIDE && successesTodayCount >= SCHOOLS_PER_RUN) {
    console.log(
      `Batch override limit reached: ${successesTodayCount}/${SCHOOLS_PER_RUN} school(s) already imported today (${today}).`
    );
    console.log(`Next offset: ${state.nextOffset}. Resume one-per-day tomorrow (default --count=1).`);
    process.exit(0);
  }

  const schoolsRemainingToday = SCHOOLS_PER_RUN - successesTodayCount;

  if (
    !BATCH_OVERRIDE &&
    !FORCE &&
    state.lastRunDate === today &&
    SUCCESS_STATUSES.has(String(state.lastStatus || ""))
  ) {
    console.log(`Already ran today (${today}). Last folder: ${state.lastFolder || "—"} (${state.lastStatus || "—"}).`);
    console.log(`Next offset: ${state.nextOffset}. Use --force only to retry a failed run (not another school).`);
    process.exit(0);
  }

  if (state.nextOffset >= totalFolders) {
    console.log(`All ${totalFolders} folders processed (offset ${state.nextOffset}). Nothing left.`);
    process.exit(0);
  }

  console.log(`Daily school gallery import`);
  console.log(`  Root: ${ROOT}`);
  console.log(`  Country: ${COUNTRY}`);
  console.log(
    `  Schools per run: ${schoolsRemainingToday} now (${successesTodayCount} already today, limit ${SCHOOLS_PER_RUN}${BATCH_OVERRIDE ? ", owner batch override" : ""})`
  );
  console.log(`  Schools already imported: ${processedFolders.size}`);
  console.log(`  Starting offset: ${state.nextOffset} / ${totalFolders} folders`);
  console.log(`  Mode: ${DRY ? "dry-run" : "live"}`);
  console.log(`  State: ${STATE_PATH}`);

  let offset = state.nextOffset;
  let result: BatchRunResult | null = null;
  let skipAttempts = 0;
  let importedToday = 0;
  const runResults: Array<{ offset: number; result: BatchRunResult }> = [];

  while (offset < totalFolders && importedToday < schoolsRemainingToday) {
    const folderName = folderNames[offset] || "";
    const folderKey = folderStateKey(folderName);
    const folderAbs = folderAbsPath(ROOT, folderName);

    if (!folderAbs) {
      console.log(`\n--- Offset ${offset}: ${folderName} — missing on disk, skipping ---`);
      offset++;
      continue;
    }

    if (processedFolders.has(folderKey)) {
      console.log(`\n--- Offset ${offset}: ${folderName} — already imported, skipping ---`);
      offset++;
      continue;
    }

    if (skipAttempts >= MAX_SKIP_ATTEMPTS) {
      console.warn(`Max skip attempts (${MAX_SKIP_ATTEMPTS}) reached.`);
      break;
    }

    console.log(`\n--- Offset ${offset}: ${folderName} ---`);
    const BATCH_RETRIES = 5;
    for (let attempt = 1; attempt <= BATCH_RETRIES; attempt++) {
      if (attempt > 1) {
        const waitSec = Math.min(30, 5 * attempt);
        console.log(`Batch retry ${attempt}/${BATCH_RETRIES} in ${waitSec}s...`);
        sleepSeconds(waitSec);
      }
      result = runBatchForFolder(folderAbs);
      if (result.exitCode === 0) break;
      console.error(`Batch import failed (exit ${result.exitCode}) attempt ${attempt}/${BATCH_RETRIES}`);
    }

    if (result.exitCode !== 0) {
      console.error(`Batch import failed after ${BATCH_RETRIES} attempts — state not advanced (retry later today).`);
      process.exit(result.exitCode);
    }

    if (SUCCESS_STATUSES.has(result.status)) {
      runResults.push({ offset, result });
      importedToday += 1;
      if (result.folderName) {
        processedFolders.add(folderStateKey(result.folderName));
      }
      console.log(`Imported ${importedToday}/${schoolsRemainingToday}: ${result.folderName}`);
      offset++;
      if (importedToday < schoolsRemainingToday) {
        skipAttempts = 0;
      }
      continue;
    }

    if (SKIP_STATUSES.has(result.status)) {
      skipAttempts++;
      console.log(`Skipped (${result.status}) — trying next folder (${skipAttempts}/${MAX_SKIP_ATTEMPTS})`);
      offset++;
      continue;
    }

    break;
  }

  if (!result) {
    console.error("No batch result");
    process.exit(1);
  }

  if (importedToday === 0 && !SUCCESS_STATUSES.has(result.status)) {
    console.warn(`Stopped without import at offset ${offset}: ${result.status}`);
  }

  if (runResults.length) {
    state.processedFolderKeys = [...processedFolders];
    state.nextOffset = runResults[runResults.length - 1].offset + 1;
    const last = runResults[runResults.length - 1].result;
    state.lastRunDate = today;
    state.lastFolder = last.folderName;
    state.lastStatus = last.status;
    state.totalRuns += runResults.length;
    for (const { offset: off, result: r } of runResults) {
      state.history.push({
        date: today,
        offset: off,
        folder: r.folderName,
        status: r.status,
        reportFile: r.reportFile,
        userId: r.userId,
      });
    }
    if (!DRY) saveState(state);

    for (const { result: r } of runResults) {
      if (!DRY && r.reportFile && fs.existsSync(r.reportFile)) {
        const uid = r.userId || "";
        if (uid && r.status === "imported") {
          console.log(`\nStarting background production upload for user ${uid}...`);
          const syncChild = spawn(
            "node",
            ["scripts/pushSchoolGalleryRemote.mjs", "--incremental", `--user-id=${uid}`],
            {
              cwd: path.resolve(__dirname, ".."),
              shell: true,
              stdio: "ignore",
              detached: true,
            }
          );
          syncChild.unref();
        }
      }
    }
  }

  console.log(
    `\nDaily run done. Imported ${importedToday}/${schoolsRemainingToday} this run (${successesTodayCount + importedToday}/${SCHOOLS_PER_RUN} today). Next offset: ${state.nextOffset} (${totalFolders - state.nextOffset} folders remaining).`
  );
  if (DRY) console.log("Dry-run — state file not updated.");
  else if (importedToday > 0) console.log("Production upload sync started in background (if applicable).");

  if (importedToday === 0) {
    process.exit(1);
  }
}

main();
