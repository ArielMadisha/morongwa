/** Print docker mount Source->Destination for morongwa containers (no secrets). */
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
for n in morongwa-api-test morongwa-web-test; do
  echo "=== $n mounts ==="
  docker inspect "$n" --format '{{json .Mounts}}' 2>&1
  echo "=== $n working dir / image ==="
  docker inspect "$n" --format 'Image={{.Config.Image}} WorkDir={{.Config.WorkingDir}}' 2>&1
done
EOS`;

const conn = await new Promise((resolve, reject) => {
  const c = new Client();
  c.on("ready", () => resolve(c)).on("error", reject).connect({ host, username: user, password, port, readyTimeout: 120000 });
});
conn.exec(cmd, (err, stream) => {
  if (err) throw err;
  stream.on("data", (d) => process.stdout.write(String(d)));
  stream.stderr.on("data", (d) => process.stderr.write(String(d)));
  stream.on("close", () => conn.end());
});
