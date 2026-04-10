/**
 * Deploy full backend/ tree to production (excluding node_modules, dist, heavy dirs),
 * then npm run build inside morongwa-api-test and restart.
 *
 * Run from backend/: node scripts/pushBackendFullRemote.mjs
 * Requires: deploy-server.config + deploy-server.secrets (same as frontend deploy)
 */
import { Client } from "ssh2";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

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

function parseHostUser(cfg) {
  const raw = (cfg.DEPLOY_SSH_HOST || "").trim();
  if (raw.includes("@")) {
    const at = raw.indexOf("@");
    return { user: raw.slice(0, at).trim(), host: raw.slice(at + 1).trim() };
  }
  return { user: (cfg.DEPLOY_SSH_USER || "root").trim(), host: raw.trim() };
}

function mergeDeployConfig() {
  const config = loadKv(path.join(repoRoot, "deploy-server.config"));
  const secrets = loadKv(path.join(repoRoot, "deploy-server.secrets"));
  return { ...config, ...secrets };
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

function buildLocalTarball() {
  const backendDir = path.join(repoRoot, "backend");
  if (!fs.existsSync(backendDir)) throw new Error(`Missing ${backendDir}`);
  const out = path.join(repoRoot, "morongwa-backend-deploy.tgz");
  fs.rmSync(out, { force: true });

  if (process.platform === "win32") {
    const stage = path.join(repoRoot, "_pack_backend");
    const dest = path.join(stage, "backend");
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    try {
      execSync(
        `robocopy "${backendDir}" "${dest}" /MIR /XD node_modules dist .git uploads logs coverage .next /XF .env .env.* /NFL /NDL /NJH /NJS /nc /ns /np`,
        { stdio: "inherit", windowsHide: true }
      );
    } catch (e) {
      const code = e.status ?? e.code;
      if (typeof code === "number" && code >= 8) throw e;
    }
    execSync(`tar -czf "${out}" -C "${stage}" backend`, { stdio: "inherit" });
    fs.rmSync(stage, { recursive: true, force: true });
  } else {
    execSync(
      `tar -czf "${out}" --exclude=node_modules --exclude=dist --exclude=.git --exclude=uploads --exclude=logs --exclude=coverage --exclude=.env --exclude=.env.* -C "${repoRoot}" backend`,
      { stdio: "inherit" }
    );
  }

  const mb = (fs.statSync(out).size / (1024 * 1024)).toFixed(2);
  console.log(`Wrote ${out} (${mb} MB)`);
  return out;
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

async function main() {
  const envPass = (process.env.DEPLOY_SSH_PASSWORD || "").trim();
  const cfg = mergeDeployConfig();
  if (envPass) cfg.DEPLOY_SSH_PASSWORD = envPass;

  const staging = (cfg.MORONGWA_STAGING_PARENT || "/root").replace(/\/$/, "");
  const remoteBackendRoot = resolveRemoteBackendRoot(cfg).replace(/\/$/, "");
  const apiContainer = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim() || "morongwa-api-test";
  const remoteTgz = `${staging}/morongwa-backend-deploy.tgz`;

  console.log(`==> Remote backend path: ${remoteBackendRoot}`);
  console.log(`==> Docker API container: ${apiContainer}`);

  console.log("==> Building backend tarball (excludes node_modules, dist)...");
  const tarball = buildLocalTarball();

  const conn = await connect(cfg);
  console.log(`==> SFTP -> ${remoteTgz}`);
  await sftpPut(conn, tarball, remoteTgz);

  const extractAndRebuild = `
set -e
cd "$(dirname "${remoteBackendRoot}")"
tar -xzf "${remoteTgz}"
echo "==> Extracted into $(pwd)/backend"
docker exec ${apiContainer} bash -lc 'cd /app && npm install --include=dev && npm run build'
docker restart ${apiContainer}
echo "==> API container restarted"
`.trim();

  console.log(`==> Remote extract + tsc + restart ${apiContainer}...`);
  await execSsh(conn, extractAndRebuild);
  conn.end();

  fs.rmSync(tarball, { force: true });
  console.log("==> Backend deploy done.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
