/**
 * SFTP local backend/uploads/school-gallery/* to production (deploy excludes uploads/).
 *
 *   node scripts/pushSchoolGalleryUploadsRemote.mjs
 *   node scripts/pushSchoolGalleryUploadsRemote.mjs --user-id=507f1f77bcf86cd799439011
 */
import { Client } from "ssh2";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

function loadKv(absPath) {
  const o = {};
  if (!fs.existsSync(absPath)) return o;
  let text = fs.readFileSync(absPath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim().replace(/\r/g, "");
    let val = t.slice(i + 1).trim().replace(/\r/g, "");
    const hash = val.indexOf(" #");
    if (hash >= 0) val = val.slice(0, hash).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    o[key] = val;
  }
  return o;
}

function mergeDeployConfig() {
  const config = loadKv(path.join(repoRoot, "deploy-server.config"));
  const secrets = loadKv(path.join(repoRoot, "deploy-server.secrets"));
  return { ...config, ...secrets };
}

function parseHostUser(cfg) {
  const raw = (cfg.DEPLOY_SSH_HOST || "").trim();
  if (raw.includes("@")) {
    const at = raw.indexOf("@");
    return { user: raw.slice(0, at).trim(), host: raw.slice(at + 1).trim() };
  }
  return { user: (cfg.DEPLOY_SSH_USER || "root").trim(), host: raw.trim() };
}

function connect(cfg) {
  const { user, host } = parseHostUser(cfg);
  const password = (cfg.DEPLOY_SSH_PASSWORD || "").trim();
  const port = parseInt(cfg.DEPLOY_SSH_PORT || "22", 10) || 22;
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => resolve(c))
      .on("error", reject)
      .connect({ host, username: user, password, port, readyTimeout: 120000 });
  });
}

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

function execSsh(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => process.stdout.write(String(d)));
      stream.stderr.on("data", (d) => process.stderr.write(String(d)));
      stream.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Remote exit ${code}`));
      });
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

function listGalleryFiles(localRoot, onlyUserId) {
  const out = [];
  if (!fs.existsSync(localRoot)) return out;
  for (const uid of fs.readdirSync(localRoot)) {
    if (onlyUserId && uid !== onlyUserId) continue;
    const dir = path.join(localRoot, uid);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (!fs.statSync(full).isFile()) continue;
      if (!/\.(jpe?g|png|gif|webp)$/i.test(name)) continue;
      out.push({ local: full, rel: `${uid}/${name}` });
    }
  }
  return out;
}

async function main() {
  const onlyUserId = (process.argv.find((a) => a.startsWith("--user-id=")) || "")
    .slice("--user-id=".length)
    .trim();

  const envPass = (process.env.DEPLOY_SSH_PASSWORD || "").trim();
  const cfg = mergeDeployConfig();
  if (envPass) cfg.DEPLOY_SSH_PASSWORD = envPass;

  const localRoot = path.join(repoRoot, "backend", "uploads", "school-gallery");
  const files = listGalleryFiles(localRoot, onlyUserId || undefined);
  if (!files.length) {
    console.log("No school-gallery files to sync.");
    process.exit(0);
  }

  const remoteBackendRoot = resolveRemoteBackendRoot(cfg).replace(/\/$/, "");
  const remoteRoot = `${remoteBackendRoot}/uploads/school-gallery`;

  console.log(`==> Upload ${files.length} school-gallery file(s) -> ${remoteRoot}/`);
  const conn = await connect(cfg);
  await execSsh(conn, `mkdir -p "${remoteRoot}"`);

  for (const f of files) {
    const remoteDir = `${remoteRoot}/${path.dirname(f.rel).replace(/\\/g, "/")}`;
    await execSsh(conn, `mkdir -p "${remoteDir}"`);
    const remote = `${remoteRoot}/${f.rel.replace(/\\/g, "/")}`;
    await sftpPut(conn, f.local, remote);
    console.log(`    ${f.rel}`);
  }
  conn.end();
  console.log("==> School gallery sync done.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
