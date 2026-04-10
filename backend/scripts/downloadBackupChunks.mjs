/**
 * Download all backup tarball chunks sequentially (resumable per file).
 *
 * Prerequisites: copy backend/.env.deploy.example -> backend/.env.deploy and set secrets.
 *
 *   cd backend
 *   node scripts/downloadBackupChunks.mjs              # parts 00–08
 *   node scripts/downloadBackupChunks.mjs 3            # start at part 03 (after a failure)
 *
 * Env: same as env.deploy.example; optional SCRUB_LOCAL_CHUNKS=1 deletes local *.part-* first.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
dotenv.config({ path: path.join(backendRoot, ".env.deploy") });

const host = process.env.PROD_SSH_HOST;
const user = process.env.PROD_SSH_USER;
const password = process.env.PROD_SSH_PASSWORD;
const port = process.env.PROD_SSH_PORT || "22";
const remoteDir = process.env.BACKUP_CHUNKS_REMOTE_DIR || "/home/zweppe/backups/chunks";
const baseName =
  process.env.BACKUP_CHUNK_BASENAME || "pre-morongwa-cutover-20260401_105119";
const localRoot =
  process.env.BACKUP_DOWNLOAD_LOCAL_DIR ||
  path.join(backendRoot, "..", "Qwertymates-backups", "chunks");

const PART_COUNT = 9;

const startFrom = Math.max(0, Math.min(PART_COUNT - 1, parseInt(process.argv[2] || "0", 10) || 0));

if (!host || !user || !password) {
  console.error(
    "Missing PROD_SSH_HOST / PROD_SSH_USER / PROD_SSH_PASSWORD.\n" +
      `Create ${path.join(backendRoot, ".env.deploy")} from .env.deploy.example`
  );
  process.exit(1);
}

if (process.env.SCRUB_LOCAL_CHUNKS === "1") {
  fs.mkdirSync(localRoot, { recursive: true });
  for (const f of fs.readdirSync(localRoot)) {
    if (f.startsWith(baseName + ".part-")) {
      fs.unlinkSync(path.join(localRoot, f));
      console.log("removed", f);
    }
  }
}

fs.mkdirSync(localRoot, { recursive: true });

const script = path.join(__dirname, "downloadFileSsh.mjs");

function runPart(index) {
  const part = `${baseName}.part-${String(index).padStart(2, "0")}`;
  const remote = `${remoteDir.replace(/\/$/, "")}/${part}`;
  const local = path.join(localRoot, part);
  return new Promise((resolve, reject) => {
    console.log(`\n=== part ${index} / ${PART_COUNT - 1}: ${part} ===`);
    const child = spawn(process.execPath, [script, host, user, password, remote, local, port], {
      stdio: "inherit",
      cwd: backendRoot,
      env: { ...process.env },
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`downloadFileSsh exited ${code}`))
    );
  });
}

async function main() {
  console.log("local dir:", localRoot);
  console.log("remote dir:", remoteDir);
  console.log("starting at part:", startFrom);
  for (let i = startFrom; i < PART_COUNT; i++) {
    await runPart(i);
  }
  console.log("\nAll chunk downloads finished.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
