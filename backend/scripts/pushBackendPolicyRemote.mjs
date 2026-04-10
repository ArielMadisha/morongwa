/**
 * Upload backend/src/services/policyService.ts and rebuild + restart morongwa-api-test.
 * Uses repo-root deploy-server.config + deploy-server.secrets.
 * Run from backend/: node scripts/pushBackendPolicyRemote.mjs
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

async function main() {
  const envPass = (process.env.DEPLOY_SSH_PASSWORD || "").trim();
  const cfg = mergeDeployConfig();
  if (envPass) cfg.DEPLOY_SSH_PASSWORD = envPass;

  const localFile = path.join(repoRoot, "backend", "src", "services", "policyService.ts");
  if (!fs.existsSync(localFile)) throw new Error(`Missing ${localFile}`);

  /** Host path backing morongwa-api-test /app (see docker inspect Mounts). */
  const remoteBackendRoot =
    (cfg.MORONGWA_BACKEND_HOST_PATH || "/home/zweppe/morongwa-live/backend").replace(/\/$/, "");
  const remoteFile = `${remoteBackendRoot}/src/services/policyService.ts`;

  const conn = await connect(cfg);
  console.log(`==> SFTP ${localFile} -> ${remoteFile}`);
  await sftpPut(conn, localFile, remoteFile);

  const rebuild =
    "docker exec morongwa-api-test bash -lc 'cd /app && npm run build' && docker restart morongwa-api-test";
  console.log("==> Rebuild inside container + restart API (ensureDefaultPolicies runs on boot)...");
  await execSsh(conn, rebuild);
  conn.end();
  console.log("==> Done.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
