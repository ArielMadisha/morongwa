/**
 * Owner batch override: import all remaining school folders for one letter prefix
 * (e.g. every "A" school still in the daily queue).
 *
 * Updates school-gallery-daily-state.json — same keys/history as the daily job.
 * Does NOT weaken the daily one-school guard; use only when the owner explicitly
 * requests a letter batch (see --letter=).
 *
 * From backend/:
 *   npm run school:import-gallery-letter-batch -- --letter=A --dry-run
 *   npm run school:import-gallery-letter-batch -- --letter=A
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { spawn, spawnSync, execSync } from "child_process";
import { resolveSchoolGalleryFolderPath } from "./lib/schoolGalleryFiles";
import { cleanFolderLabel, matchKey } from "./lib/schoolNameMatching";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");

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
const LETTER = (argValue("--letter=") || "A").trim().charAt(0).toUpperCase();
const MAX_SCHOOLS = Math.max(0, parseInt(argValue("--max=") || "0", 10) || 0);
const STATE_PATH = path.resolve(__dirname, "../exports/school-gallery-daily-state.json");
const CATALOG_PATH = path.resolve(__dirname, "../exports/school-gallery-folder-catalog.json");

const SUCCESS_STATUSES = new Set(["imported", "dry_run_ok", "would_create_user"]);
const SKIP_STATUSES = new Set(["skip_not_school_name", "skip_no_images", "no_match", "ambiguous"]);
const MAX_SKIP_ATTEMPTS = 80;
const BATCH_RETRIES = 5;
const STATE_SAVE_EVERY = 5;

type DailyState = {
  root: string;
  country: string;
  nextOffset: number;
  lastRunDate: string | null;
  lastFolder: string | null;
  lastStatus: string | null;
  totalRuns: number;
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

function startsWithLetter(folderName: string): boolean {
  const label = cleanFolderLabel(folderName).trim();
  if (!label) return false;
  return label.charAt(0).toUpperCase() === LETTER;
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
    const history = Array.isArray(raw.history) ? raw.history.slice(-2000) : [];
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

function loadFolderCatalog(root: string): string[] {
  if (fs.existsSync(CATALOG_PATH)) {
    try {
      const cat = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8")) as { root?: string; folders?: string[] };
      if (cat.root === root && Array.isArray(cat.folders) && cat.folders.length) {
        return cat.folders.map(String);
      }
    } catch {
      /* rebuild below */
    }
  }
  console.error(`Folder catalog missing or stale. Run: npm run school:import-gallery-daily -- --refresh-catalog --dry-run`);
  process.exit(1);
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
      /* ignore */
    }
  }

  return { exitCode: child.status ?? 1, folderName, status, userId, reportFile };
}

function main() {
  if (!fs.existsSync(ROOT) || !fs.statSync(ROOT).isDirectory()) {
    console.error(`Schools root not found: ${ROOT}`);
    process.exit(1);
  }

  const state = loadState();
  const today = todayKey();
  const folderNames = loadFolderCatalog(ROOT);
  const totalFolders = folderNames.length;
  const processedFolders = buildProcessedFolderSet(state);

  let offset = state.nextOffset;
  let imported = 0;
  let skipAttempts = 0;
  const runLog: Array<{ offset: number; folder: string; status: string }> = [];

  console.log(`Letter batch school gallery import (owner override)`);
  console.log(`  Letter: ${LETTER}`);
  console.log(`  Root: ${ROOT}`);
  console.log(`  Country: ${COUNTRY}`);
  console.log(`  Starting offset: ${offset} / ${totalFolders}`);
  console.log(`  Mode: ${DRY ? "dry-run" : "live"}`);
  if (MAX_SCHOOLS > 0) console.log(`  Max schools this run: ${MAX_SCHOOLS}`);
  console.log(`  State: ${STATE_PATH}`);

  while (offset < totalFolders) {
    const folderName = folderNames[offset] || "";
    if (!startsWithLetter(folderName)) {
      console.log(`\nReached first non-${LETTER} folder at offset ${offset}: ${folderName}`);
      break;
    }

    if (MAX_SCHOOLS > 0 && imported >= MAX_SCHOOLS) {
      console.log(`\nReached --max=${MAX_SCHOOLS} imported schools. Stopping.`);
      break;
    }

    const folderKey = folderStateKey(folderName);
    const folderAbs = resolveSchoolGalleryFolderPath(ROOT, folderName);

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

    console.log(`\n--- [${imported + 1}] Offset ${offset}: ${folderName} ---`);
    let result: BatchRunResult | null = null;
    for (let attempt = 1; attempt <= BATCH_RETRIES; attempt++) {
      if (attempt > 1) {
        const waitSec = Math.min(30, 5 * attempt);
        console.log(`Batch retry ${attempt}/${BATCH_RETRIES} in ${waitSec}s...`);
        sleepSeconds(waitSec);
      }
      result = runBatchForFolder(folderAbs);
      if (result.exitCode === 0) break;
      console.error(`Batch failed (exit ${result.exitCode}) attempt ${attempt}/${BATCH_RETRIES}`);
    }

    if (!result || result.exitCode !== 0) {
      console.error(`Stopping letter batch — failed after ${BATCH_RETRIES} attempts at offset ${offset}.`);
      if (!DRY && imported > 0) saveState(state);
      process.exit(result?.exitCode ?? 1);
    }

    runLog.push({ offset, folder: result.folderName, status: result.status });

    if (SUCCESS_STATUSES.has(result.status)) {
      imported++;
      processedFolders.add(folderStateKey(result.folderName));
      state.processedFolderKeys = [...processedFolders];
      state.nextOffset = offset + 1;
      state.lastRunDate = today;
      state.lastFolder = result.folderName;
      state.lastStatus = result.status;
      state.totalRuns += 1;
      state.history.push({
        date: today,
        offset,
        folder: result.folderName,
        status: result.status,
        reportFile: result.reportFile,
        userId: result.userId,
      });
      if (!DRY && (imported % STATE_SAVE_EVERY === 0 || imported === 1)) {
        saveState(state);
        console.log(`State saved (${imported} imported, next offset ${state.nextOffset})`);
      }
      offset++;
      skipAttempts = 0;
      continue;
    }

    if (SKIP_STATUSES.has(result.status)) {
      skipAttempts++;
      console.log(`Skipped (${result.status}) — next folder (${skipAttempts}/${MAX_SKIP_ATTEMPTS})`);
      offset++;
      continue;
    }

    console.warn(`Unknown status "${result.status}" at offset ${offset} — stopping.`);
    break;
  }

  if (!DRY && imported > 0) {
    saveState(state);
    console.log(`\nStarting production gallery sync (incremental)...`);
    const sync = spawnSync("node", ["scripts/pushSchoolGalleryRemote.mjs", "--incremental"], {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      shell: true,
      stdio: "inherit",
    });
    if (sync.status !== 0) {
      console.warn(`pushSchoolGalleryRemote exited ${sync.status} — re-run manually when batch finishes.`);
    }
  }

  console.log(`\nLetter batch done. Imported ${imported} "${LETTER}" school(s). Next offset: ${state.nextOffset}.`);
  if (DRY) console.log("Dry-run — state file not updated.");
}

main();
