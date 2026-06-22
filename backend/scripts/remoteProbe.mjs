/** One-shot: print node/npm/docker paths on VPS (no secrets in output). */
import { fileURLToPath } from "url";
import path from "path";
import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

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

const cfg = mergeDeployConfig(repoRoot);
const envPass = (process.env.DEPLOY_SSH_PASSWORD || "").trim();
if (envPass) cfg.DEPLOY_SSH_PASSWORD = envPass;
const secretsPath = path.join(repoRoot, "deploy-server.secrets");

const conn = await sshConnect(cfg, repoRoot, { secretsPath });
conn.exec(cmd, { pty: true }, (err, stream) => {
  if (err) throw err;
  stream.on("data", (d) => process.stdout.write(String(d)));
  stream.stderr.on("data", (d) => process.stderr.write(String(d)));
  stream.on("close", () => conn.end());
});
