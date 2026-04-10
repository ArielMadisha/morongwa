/**
 * Merge PayGate + public HTTPS URLs into the remote backend/.env and restart morongwa-api-test.
 *
 * - Reads PAYGATE_ID, PAYGATE_SECRET, PAYGATE_URL from local backend/.env (do not commit secrets).
 * - Sets FRONTEND_URL / BACKEND_URL to production HTTPS (overrides localhost) unless
 *   SYNC_PROD_FRONTEND_URL / SYNC_PROD_BACKEND_URL are set in the environment.
 *
 * Run from backend/: node scripts/syncProdPayGateEnvRemote.mjs
 * Requires: repo-root deploy-server.config + deploy-server.secrets (same as pushBackendFullRemote.mjs)
 */
import { Client } from "ssh2";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");

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

function sftpReadFile(conn, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.readFile(remotePath, (e, buf) => {
        if (e) {
          if (e.code === 2 || e.code === "ENOENT") return resolve(null);
          return reject(e);
        }
        resolve(buf.toString("utf8"));
      });
    });
  });
}

function sftpWriteFile(conn, remotePath, content) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const buf = Buffer.from(content, "utf8");
      sftp.writeFile(remotePath, buf, (e) => {
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

/**
 * Set or replace KEY=value lines; preserve other lines and comments.
 */
function upsertEnvLines(originalText, updates) {
  const keys = new Set(Object.keys(updates));
  const out = [];
  const seen = new Set();
  const rawLines = (originalText || "").split(/\r?\n/);
  for (const line of rawLines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m && keys.has(m[1])) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push(`${m[1]}=${updates[m[1]]}`);
      continue;
    }
    out.push(line);
  }
  for (const k of keys) {
    if (!seen.has(k)) {
      out.push(`${k}=${updates[k]}`);
    }
  }
  if (out.length && !out[out.length - 1].endsWith("\n") && originalText && originalText.endsWith("\n")) {
    /* keep file ending style */
  }
  return out.join("\n") + (out.length ? "\n" : "");
}

function redactKey(k, v) {
  if (/SECRET|PASSWORD|TOKEN|KEY|URI|MONGO|AUTH/i.test(k)) return `${k}=***`;
  return `${k}=${String(v).slice(0, 8)}…`;
}

async function main() {
  const envPass = (process.env.DEPLOY_SSH_PASSWORD || "").trim();
  const cfg = mergeDeployConfig();
  if (envPass) cfg.DEPLOY_SSH_PASSWORD = envPass;

  const localEnvPath = path.join(backendRoot, ".env");
  if (!fs.existsSync(localEnvPath)) {
    throw new Error(`Missing ${localEnvPath}`);
  }
  const local = loadKv(localEnvPath);

  const paygateId = (local.PAYGATE_ID || "").trim();
  const paygateSecret = (local.PAYGATE_SECRET || "").trim();
  const paygateUrl = (local.PAYGATE_URL || "https://secure.paygate.co.za/payweb3/process.trans").trim();

  if (!paygateId || !paygateSecret) {
    throw new Error("Local backend/.env must define PAYGATE_ID and PAYGATE_SECRET (non-empty).");
  }

  const frontendUrl = (process.env.SYNC_PROD_FRONTEND_URL || "https://www.qwertymates.com").trim().replace(/\/$/, "");
  const backendUrl = (process.env.SYNC_PROD_BACKEND_URL || "https://api.qwertymates.com").trim().replace(/\/$/, "");

  const updates = {
    PAYGATE_ID: paygateId,
    PAYGATE_SECRET: paygateSecret,
    PAYGATE_URL: paygateUrl,
    FRONTEND_URL: frontendUrl,
    BACKEND_URL: backendUrl,
    NODE_ENV: "production",
  };

  console.log("==> Values to sync (secrets redacted):");
  for (const [k, v] of Object.entries(updates)) {
    console.log("    ", redactKey(k, v));
  }

  const remoteBackendRoot = resolveRemoteBackendRoot(cfg).replace(/\/$/, "");
  const remoteEnv = `${remoteBackendRoot}/.env`;
  const apiContainer = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim() || "morongwa-api-test";

  console.log(`==> Remote .env path: ${remoteEnv}`);
  console.log(`==> Docker API container: ${apiContainer}`);

  const conn = await connect(cfg);
  let existing = null;
  try {
    existing = await sftpReadFile(conn, remoteEnv);
  } catch (e) {
    console.warn("==> Could not read remote .env (will create):", String(e?.message || e));
  }
  const merged = upsertEnvLines(existing || "", updates);
  await sftpWriteFile(conn, remoteEnv, merged);
  console.log("==> Wrote merged .env on server.");

  await execSsh(conn, `docker restart ${apiContainer}`);
  conn.end();
  console.log(`==> Restarted ${apiContainer}. PayGate + public URLs are active after the container starts.`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
