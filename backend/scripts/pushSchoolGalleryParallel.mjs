/**
 * Upload school-gallery in parallel (one SSH session per school user folder).
 *   node scripts/pushSchoolGalleryParallel.mjs
 *   node scripts/pushSchoolGalleryParallel.mjs --workers=6
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const pushScript = path.join(__dirname, "pushSchoolGalleryRemote.mjs");

function argValue(argv, prefix) {
  const hit = argv.find((a) => a.startsWith(prefix));
  if (!hit) return undefined;
  return hit.slice(prefix.length).trim() || argv[argv.indexOf(hit) + 1];
}

function runOne(uid) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [pushScript, `--user-id=${uid}`, "--incremental"],
      { cwd: path.join(repoRoot, "backend"), stdio: ["ignore", "pipe", "pipe"] }
    );
    let err = "";
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    child.on("close", (code) => {
      resolve({ uid, code, err: err.trim() });
    });
  });
}

async function pool(items, workers, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, () => worker()));
  return results;
}

async function main() {
  const argv = process.argv.slice(2);
  const workers = Math.min(8, Math.max(1, parseInt(argValue(argv, "--workers=") || "4", 10) || 4));
  const galleryRoot = path.join(repoRoot, "backend", "uploads", "school-gallery");
  const uids = fs
    .readdirSync(galleryRoot)
    .filter((n) => fs.statSync(path.join(galleryRoot, n)).isDirectory())
    .sort();

  console.log(`==> Parallel sync: ${uids.length} schools, ${workers} workers`);
  const results = await pool(uids, workers, runOne);
  const failed = results.filter((r) => r.code !== 0);
  console.log(`==> Done. failed=${failed.length}/${results.length}`);
  if (failed.length) {
    for (const f of failed.slice(0, 10)) console.error(`  ${f.uid}: ${f.err || "exit " + f.code}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
