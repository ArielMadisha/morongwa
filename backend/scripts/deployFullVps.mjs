/**
 * Full deploy: tarball repo (excludes node_modules, dist, .next, .env), upload via SFTP,
 * extract on VPS, npm install + build backend + frontend, pm2 restart all.
 *
 * Requires: deploy-server.config + deploy-server.secrets (DEPLOY_SSH_PASSWORD) in repo root.
 * Run from backend/:  node scripts/deployFullVps.mjs
 */
import { Client } from "ssh2";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

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
  const password = (process.env.DEPLOY_SSH_PASSWORD || cfg.DEPLOY_SSH_PASSWORD || "").trim();
  const port = parseInt(cfg.DEPLOY_SSH_PORT || "22", 10) || 22;
  if (!password) {
    return Promise.reject(new Error("Missing DEPLOY_SSH_PASSWORD in deploy-server.secrets or env"));
  }
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


function execSsh(conn, cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, { pty: true, ...opts }, (err, stream) => {
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

function buildTarball() {
  const out = path.join(repoRoot, "_morongwa_full_deploy.tgz");
  fs.rmSync(out, { force: true });
  /** Only backend + frontend — avoids multi‑GB repo tarballs (mobile, assets, .cursor, etc.). */
  const ex = [
    "node_modules",
    ".next",
    "dist",
    ".git",
    "coverage",
    "uploads",
    "logs",
    ".env",
    ".env.local",
    ".env.production",
  ]
    .map((e) => `--exclude=${e}`)
    .join(" ");
  console.log("==> Creating tarball (backend + frontend only, ustar for Linux tar)...");
  execSync(
    `tar --format=ustar -czf "${out}" ${ex} -C "${repoRoot}" backend frontend`,
    {
    stdio: "inherit",
    windowsHide: true,
    shell: true,
  });
  const mb = (fs.statSync(out).size / (1024 * 1024)).toFixed(2);
  console.log(`==> Wrote tarball (${mb} MB)`);
  return out;
}

async function main() {
  const cfg = mergeDeployConfig();
  const remotePath = (cfg.DEPLOY_REMOTE_PATH || "/var/www/morongwa").replace(/\/$/, "");
  const remoteTar = "/tmp/morongwa_full_deploy.tgz";

  const tarball = buildTarball();
  const localSize = fs.statSync(tarball).size;
  const conn = await connect(cfg);

  await execSsh(conn, `rm -f ${remoteTar}`);
  console.log(`==> SFTP -> ${remoteTar} (${localSize} bytes)`);
  await sftpPut(conn, tarball, remoteTar);
  await execSsh(conn, `test $(stat -c%s ${remoteTar}) -eq ${localSize}`);

  console.log("==> Remote extract + build + pm2...");
  await execSsh(conn, `bash -lc 'set -e; cd ${remotePath} && tar -xzf ${remoteTar} && rm -f ${remoteTar}'`);

  const remoteScript = `#!/usr/bin/env bash
set -eo pipefail
export PATH="/snap/bin:/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/sbin"
# Non-interactive SSH has no login profile — load the same env as an SSH login.
[ -f /etc/profile ] && . /etc/profile
[ -f "$HOME/.profile" ] && . "$HOME/.profile"
[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"
[ -f "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
command -v nvm >/dev/null 2>&1 && nvm use default 2>/dev/null || true
# Add every nvm Node bin dir (non-interactive SSH often skips nvm.sh)
if [ -d "$HOME/.nvm/versions/node" ]; then
  for vdir in "$HOME/.nvm/versions/node"/*; do
    if [ -x "$vdir/bin/node" ]; then export PATH="$vdir/bin:$PATH"; fi
  done
fi
if ! command -v npm >/dev/null 2>&1; then
  for d in "$HOME/.nvm/versions/node"/*/bin; do
    if [ -x "$d/npm" ]; then export PATH="$d:$PATH"; break; fi
  done
fi
if ! command -v npm >/dev/null 2>&1 && [ -x /usr/bin/npm ]; then export PATH="/usr/bin:$PATH"; fi
NPM_CMD=""
if command -v npm >/dev/null 2>&1; then NPM_CMD="npm"
elif [ -x /usr/bin/node ] && [ -f /usr/lib/node_modules/npm/bin/npm-cli.js ]; then
  NPM_CMD="node_npm_cli"
fi
if [ -z "$NPM_CMD" ]; then
  echo "npm not found. Debug: node=$(command -v node || echo none) PATH=$PATH" >&2
  ls -la /usr/bin/node /usr/bin/npm /usr/lib/node_modules/npm/bin/npm-cli.js 2>/dev/null || true
  exit 127
fi
cd "${remotePath}/backend"
if [ "$NPM_CMD" = "npm" ]; then
  npm install && npm run build
elif [ "$NPM_CMD" = "node_npm_cli" ]; then
  /usr/bin/node /usr/lib/node_modules/npm/bin/npm-cli.js install
  /usr/bin/node /usr/lib/node_modules/npm/bin/npm-cli.js run build
else
  exit 1
fi
cd "${remotePath}/frontend"
if [ "$NPM_CMD" = "npm" ]; then
  npm install && npm run build
elif [ "$NPM_CMD" = "node_npm_cli" ]; then
  /usr/bin/node /usr/lib/node_modules/npm/bin/npm-cli.js install
  /usr/bin/node /usr/lib/node_modules/npm/bin/npm-cli.js run build
else
  exit 1
fi
pm2 restart all || pm2 restart morongwa-api || pm2 restart api || true
echo "Deploy script finished."
`;
  const localSh = path.join(repoRoot, "_morongwa_deploy_run.sh");
  fs.writeFileSync(localSh, remoteScript, { mode: 0o755 });
  const remoteShPath = "/tmp/morongwa_deploy_run.sh";
  await sftpPut(conn, localSh, remoteShPath);
  fs.rmSync(localSh, { force: true });
  await execSsh(conn, `chmod +x ${remoteShPath} && bash -l ${remoteShPath}`);
  conn.end();

  fs.rmSync(tarball, { force: true });
  console.log("==> Full VPS deploy finished.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
