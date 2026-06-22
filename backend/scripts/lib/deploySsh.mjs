/**
 * Shared SSH auth for deploy scripts (ssh2).
 * Supports password and/or OpenSSH private key (same as many manual `ssh` setups).
 *
 * Also loads `backend/.env` so `DEPLOY_SECRET` (SSH password) and optional `SSH_HOST`
 * match what you keep next to the Node app config.
 */
import { Client } from "ssh2";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

const _backendEnvLoadedForRoot = new Set();

/** Load backend/.env once per repo root (provides DEPLOY_SECRET, SSH_HOST, etc.). */
export function loadBackendDeployEnv(repoRoot) {
  if (_backendEnvLoadedForRoot.has(repoRoot)) return;
  const envPath = path.join(repoRoot, "backend", ".env");
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: false });
  _backendEnvLoadedForRoot.add(repoRoot);
}

export function loadKv(absPath) {
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

export function parseHostUser(cfg) {
  const raw = (cfg.DEPLOY_SSH_HOST || "").trim();
  if (raw.includes("@")) {
    const at = raw.indexOf("@");
    return { user: raw.slice(0, at).trim(), host: raw.slice(at + 1).trim() };
  }
  return { user: (cfg.DEPLOY_SSH_USER || "root").trim(), host: raw.trim() };
}

export function mergeDeployConfig(repoRoot) {
  loadBackendDeployEnv(repoRoot);
  const config = loadKv(path.join(repoRoot, "deploy-server.config"));
  const secrets = loadKv(path.join(repoRoot, "deploy-server.secrets"));
  const cfg = { ...config, ...secrets };
  const sshHost = (process.env.SSH_HOST || "").trim();
  if (!(cfg.DEPLOY_SSH_HOST || "").trim() && sshHost) cfg.DEPLOY_SSH_HOST = sshHost;
  const sshPort = (process.env.SSH_PORT || "").trim();
  if (!(cfg.DEPLOY_SSH_PORT || "").trim() && sshPort) cfg.DEPLOY_SSH_PORT = sshPort;
  return cfg;
}

/**
 * @param {Record<string, string>} cfg merged deploy config + secrets
 * @param {string} repoRoot monorepo root (parent of backend/)
 * @param {{ secretsPath?: string }} [opts]
 */
export function sshConnect(cfg, repoRoot, opts = {}) {
  loadBackendDeployEnv(repoRoot);
  const { user, host } = parseHostUser(cfg);
  if (!host) throw new Error("Set DEPLOY_SSH_HOST in deploy-server.config (e.g. root@your.droplet.ip)");

  const port = parseInt(cfg.DEPLOY_SSH_PORT || "22", 10) || 22;
  const password = (
    process.env.DEPLOY_SSH_PASSWORD ||
    process.env.DEPLOY_SECRET ||
    cfg.DEPLOY_SSH_PASSWORD ||
    ""
  ).trim();
  const keyPathRaw = (process.env.DEPLOY_SSH_PRIVATE_KEY_PATH || cfg.DEPLOY_SSH_PRIVATE_KEY_PATH || "").trim();
  const passphrase = (
    process.env.DEPLOY_SSH_PRIVATE_KEY_PASSPHRASE ||
    cfg.DEPLOY_SSH_PRIVATE_KEY_PASSPHRASE ||
    ""
  ).trim();

  let privateKey;
  if (keyPathRaw) {
    const keyAbs = path.isAbsolute(keyPathRaw) ? keyPathRaw : path.join(repoRoot, keyPathRaw);
    if (!fs.existsSync(keyAbs)) {
      throw new Error(`DEPLOY_SSH_PRIVATE_KEY_PATH not found: ${keyAbs}`);
    }
    privateKey = fs.readFileSync(keyAbs);
  }

  if (!password && !privateKey) {
    const secretsPath = opts.secretsPath || path.join(repoRoot, "deploy-server.secrets");
    throw new Error(
      "Deploy SSH: no credentials.\n\n" +
        "Fix one of these:\n" +
        `  1) Edit ${secretsPath} — set DEPLOY_SSH_PASSWORD=... (no spaces around =)\n` +
        "  2) And/or set DEPLOY_SSH_PRIVATE_KEY_PATH to an OpenSSH private key (repo-relative or absolute)\n" +
        "  3) Set DEPLOY_SECRET in backend/.env (same as root SSH password), or PowerShell: $env:DEPLOY_SSH_PASSWORD='...'\n" +
        "  4) Or $env:DEPLOY_SSH_PRIVATE_KEY_PATH=\"$env:USERPROFILE\\.ssh\\id_ed25519\"\n\n" +
        "If the server disables password login, you must use a key. See deploy-server.secrets.example."
    );
  }

  const connectOpts = { host, username: user, port, readyTimeout: 120000 };
  if (privateKey) {
    connectOpts.privateKey = privateKey;
    if (passphrase) connectOpts.passphrase = passphrase;
  }
  if (password) connectOpts.password = password;

  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => resolve(c)).on("error", reject).connect(connectOpts);
  });
}

/**
 * Build a remote bash snippet that patches KEY=value lines in an env file (no sed/glob pitfalls).
 * Values may contain spaces, commas, or asterisks (e.g. cron expressions).
 */
export function buildRemoteEnvPatchScript(envFile, patch) {
  const updatesJson = JSON.stringify(patch);
  return `python3 << 'ENVPATCH_EOF'
import json, re
path = ${JSON.stringify(envFile)}
updates = json.loads(${JSON.stringify(updatesJson)})
lines = []
seen = set()
try:
    with open(path, encoding="utf-8", errors="replace") as f:
        raw = f.read().splitlines()
except FileNotFoundError:
    raw = []
for line in raw:
    m = re.match(r"^([^=#]+)=", line)
    if m:
        key = m.group(1).strip()
        if key in updates:
            lines.append(f"{key}={updates[key]}")
            seen.add(key)
            continue
    lines.append(line)
for key, val in updates.items():
    if key not in seen:
        lines.append(f"{key}={val}")
with open(path, "w", encoding="utf-8", newline="\\n") as f:
    if lines:
        f.write("\\n".join(lines) + "\\n")
print("Patched:", ", ".join(sorted(updates.keys())))
ENVPATCH_EOF`;
}

/** Run a non-interactive remote shell command (streams stdout/stderr). */
export function execSsh(conn, cmd) {
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
