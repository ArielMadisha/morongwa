/**
 * Sync local backend/uploads/school-gallery/** to production.
 * Uses a single tarball over SFTP (reliable for 1000+ files); optional --incremental for deltas.
 *
 *   node scripts/pushSchoolGalleryRemote.mjs
 *   node scripts/pushSchoolGalleryRemote.mjs --incremental
 *   node scripts/pushSchoolGalleryRemote.mjs --user-id=6a169992985bb2435180e713
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (e) => {
        if (e) reject(e);
        else resolve();
      });
    });
  });
}

function withSftp(conn, fn) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      Promise.resolve(fn(sftp)).then(resolve, reject);
    });
  });
}

function resolveRemoteBackendRoot(cfg) {
  const explicit = (cfg.MORONGWA_BACKEND_HOST_PATH || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const live = (cfg.MORONGWA_LIVE_DIR || "").trim().replace(/\/$/, "");
  if (live) return `${live}/backend`;
  const deployPath = (cfg.DEPLOY_REMOTE_PATH || "").trim().replace(/\/$/, "");
  if (deployPath) return `${deployPath}/backend`;
  return "/home/zweppe/morongwa-live/backend";
}

function walkFiles(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    const st = fs.statSync(cur);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(cur)) stack.push(path.join(cur, name));
    } else if (st.isFile() && /\.(jpe?g|png|gif|webp)$/i.test(cur)) {
      out.push(cur);
    }
  }
  return out.sort();
}

function argValue(argv, prefix) {
  const hit = argv.find((a) => a.startsWith(prefix));
  if (!hit) return undefined;
  const rest = hit.slice(prefix.length).trim();
  if (rest) return rest;
  const i = argv.indexOf(hit);
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

async function syncTarball(cfg, conn, localBase, remoteBackendRoot) {
  const uploadsParent = path.dirname(localBase);
  const dirName = path.basename(localBase);
  const bundleLocal = path.join(uploadsParent, `${dirName}-sync.tgz`);
  const remoteBundle = `/tmp/${dirName}-sync.tgz`;
  const remoteGalleryRoot = `${remoteBackendRoot}/uploads/${dirName}`;

  console.log(`==> Creating tarball ${bundleLocal} …`);
  if (fs.existsSync(bundleLocal)) fs.unlinkSync(bundleLocal);

  const tar = spawnSync(
    "tar",
    ["-czf", bundleLocal, "-C", uploadsParent, dirName],
    { stdio: "inherit", shell: false }
  );
  if (tar.status !== 0) {
    throw new Error(`tar failed (exit ${tar.status})`);
  }
  const mb = (fs.statSync(bundleLocal).size / (1024 * 1024)).toFixed(1);
  console.log(`==> Bundle ${mb} MB — uploading to ${remoteBundle} …`);

  await sftpPut(conn, bundleLocal, remoteBundle);

  console.log(`==> Extracting on server into ${remoteBackendRoot}/uploads/ …`);
  await execSsh(
    conn,
    `mkdir -p "${remoteBackendRoot}/uploads" && tar xzf "${remoteBundle}" -C "${remoteBackendRoot}/uploads" && rm -f "${remoteBundle}" && find "${remoteGalleryRoot}" -type f | wc -l`
  );

  try {
    fs.unlinkSync(bundleLocal);
  } catch {
    /* ignore */
  }
}

async function syncIncremental(conn, files, galleryRoot, remoteGalleryRoot) {
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  await withSftp(conn, async (sftp) => {
    const fastPut = (local, remote) =>
      new Promise((resolve, reject) => {
        sftp.fastPut(local, remote, (e) => (e ? reject(e) : resolve()));
      });
    const statRemote = (remote) =>
      new Promise((resolve) => {
        sftp.stat(remote, (err, st) => resolve(err ? null : st));
      });
    const mkdirp = (remoteDir) =>
      new Promise((resolve) => {
        const parts = remoteDir.replace(/\\/g, "/").split("/").filter(Boolean);
        let built = remoteDir.startsWith("/") ? "" : "";
        const step = (idx) => {
          if (idx >= parts.length) return resolve();
          built += (built === "" && remoteDir.startsWith("/") ? "/" : built === "" ? "" : "/") + parts[idx];
          const dir = remoteDir.startsWith("/") && built === "" ? `/${parts[0]}` : built;
          sftp.mkdir(dir, { mode: 0o755 }, () => step(idx + 1));
        };
        step(0);
      });

    for (let i = 0; i < files.length; i++) {
      const abs = files[i];
      const rel = path.relative(galleryRoot, abs).split(path.sep).join("/");
      const remotePath = `${remoteGalleryRoot}/${rel}`;
      const remoteDir = path.posix.dirname(remotePath);
      const localSize = fs.statSync(abs).size;

      try {
        const rst = await statRemote(remotePath);
        if (rst && rst.size === localSize) {
          skipped++;
          continue;
        }
        await mkdirp(remoteDir);
        await fastPut(abs, remotePath);
        uploaded++;
        if ((i + 1) % 50 === 0) console.log(`    … ${i + 1}/${files.length}`);
      } catch (e) {
        failed++;
        console.error(`    FAIL ${rel}: ${e.message || e}`);
      }
    }
  });

  console.log(`==> Incremental: uploaded=${uploaded}, skipped=${skipped}, failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

async function main() {
  const argv = process.argv.slice(2);
  const uid = (argValue(argv, "--user-id=") || "").trim();
  const incremental = argv.includes("--incremental");

  const cfg = mergeDeployConfig(repoRoot);
  const backendRoot = path.join(repoRoot, "backend");
  const galleryRoot = path.join(backendRoot, "uploads", "school-gallery");
  const localBase = uid ? path.join(galleryRoot, uid) : galleryRoot;

  if (!fs.existsSync(localBase)) {
    console.log(`No local folder: ${localBase}`);
    process.exit(0);
  }

  const files = walkFiles(localBase);
  if (files.length === 0) {
    console.log("No image files under local school-gallery path — nothing to sync.");
    process.exit(0);
  }

  const remoteBackendRoot = resolveRemoteBackendRoot(cfg).replace(/\/$/, "");
  const remoteGalleryRoot = `${remoteBackendRoot}/uploads/school-gallery`;

  console.log(`==> Local files: ${files.length} -> ${remoteGalleryRoot}/`);

  const conn = await sshConnect(cfg, repoRoot);

  try {
    if (incremental || uid) {
      await syncIncremental(conn, files, galleryRoot, remoteGalleryRoot);
    } else {
      await syncTarball(cfg, conn, galleryRoot, remoteBackendRoot);
    }
    const countOut = await execSsh(
      conn,
      `find "${remoteGalleryRoot}" -type f 2>/dev/null | wc -l`
    );
    console.log(`==> Remote file count: ${String(countOut).trim()}`);
  } finally {
    conn.end();
  }

  console.log("==> School gallery sync done.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
