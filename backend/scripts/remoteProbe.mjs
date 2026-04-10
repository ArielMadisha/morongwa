/** One-shot: print node/npm/docker paths on VPS (no secrets in output). */
import { Client } from "ssh2";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function loadKv(absPath) {
  const o = {};
  if (!fs.existsSync(absPath)) return o;
  for (const line of fs.readFileSync(absPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    o[t.slice(0, i).trim()] = t.slice(i + 1).trim().split(" #")[0].trim();
  }
  return o;
}
function parseHostUser(cfg) {
  const raw = (cfg.DEPLOY_SSH_HOST || "").trim();
  if (raw.includes("@")) {
    const at = raw.indexOf("@");
    return { user: raw.slice(0, at).trim(), host: raw.slice(at + 1).trim() };
  }
  return { user: cfg.DEPLOY_SSH_USER || "root", host: raw.trim() };
}

const cfg = { ...loadKv(path.join(repoRoot, "deploy-server.config")), ...loadKv(path.join(repoRoot, "deploy-server.secrets")) };
const { user, host } = parseHostUser(cfg);
const password = (process.env.DEPLOY_SSH_PASSWORD || cfg.DEPLOY_SSH_PASSWORD || "").trim();
const port = parseInt(cfg.DEPLOY_SSH_PORT || "22", 10) || 22;

const cmd = `bash -s <<'EOS'
set +e
echo "=== bash -ilc node ==="
bash -ilc 'command -v node; command -v npm; node -v' 2>&1
echo "=== glob nvm ==="
ls -la /root/.nvm/versions/node 2>&1
for f in /root/.nvm/versions/node/*/bin/node; do [ -x "$f" ] && echo "exe $f"; done
echo "=== system ==="
ls -la /usr/bin/node /usr/bin/npm 2>&1
echo "=== docker ==="
command -v docker >/dev/null && docker ps --format '{{.Names}}' 2>&1
echo "=== pm2 ==="
command -v pm2 >/dev/null && pm2 list 2>&1 | head -15
EOS`;

const conn = await new Promise((resolve, reject) => {
  const c = new Client();
  c.on("ready", () => resolve(c)).on("error", reject).connect({ host, username: user, password, port, readyTimeout: 120000 });
});
conn.exec(cmd, { pty: true }, (err, stream) => {
  if (err) throw err;
  stream.on("data", (d) => process.stdout.write(String(d)));
  stream.stderr.on("data", (d) => process.stderr.write(String(d)));
  stream.on("close", () => conn.end());
});
