import { Client } from "ssh2";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadKv(p) {
  const o = {};
  if (!fs.existsSync(p)) return o;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    const h = v.indexOf(" #");
    if (h >= 0) v = v.slice(0, h).trim();
    o[t.slice(0, i).trim()] = v;
  }
  return o;
}

function connect(cfg) {
  const raw = (cfg.DEPLOY_SSH_HOST || "").trim();
  const user = raw.includes("@") ? raw.slice(0, raw.indexOf("@")) : "root";
  const host = raw.includes("@") ? raw.slice(raw.indexOf("@") + 1) : raw;
  const password = (process.env.DEPLOY_SSH_PASSWORD || cfg.DEPLOY_SSH_PASSWORD || "").trim();
  return new Promise((resolve, reject) => {
    const c = new Client();
    c
      .on("ready", () => resolve(c))
      .on("error", reject)
      .connect({
        host,
        username: user,
        password,
        port: parseInt(cfg.DEPLOY_SSH_PORT || "22", 10) || 22,
        readyTimeout: 120000,
      });
  });
}

function execSsh(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    conn.exec(cmd, (e, stream) => {
      if (e) return reject(e);
      stream.on("data", (d) => (out += String(d)));
      stream.stderr.on("data", (d) => (err += String(d)));
      stream.on("close", (code) => resolve({ code, out, err }));
    });
  });
}

const cleanupScript = `
set +e
echo "=== remove php containers (if any) ==="
docker ps -a --format '{{.Names}} {{.Image}}' | grep -i php | awk '{print $1}' | xargs -r docker rm -f

echo "=== remove php images ==="
docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep -i php | awk '{print $2}' | xargs -r docker rmi -f

echo "=== remove orphaned php app paths ==="
rm -rf /home/zweppe/php-app
rm -rf /home/zweppe/docker/nginx/php-app
rm -rf /home/zweppe/morongwa-live/frontend/node_modules/flatted/php
rm -rf /home/zweppe/morongwa-live/backend/node_modules/flatted/php

echo "=== remove old /var/www morongwa copy (legacy) ==="
rm -rf /var/www/morongwa
rm -rf /var/www/morongwa\\r\\r

echo "=== php file scan after cleanup ==="
python3 - <<'PY'
import os
roots=["/home/zweppe","/var/www","/root"]
total=0
for root in roots:
    count=0
    if not os.path.exists(root):
      print("MISSING",root)
      continue
    for dp,_,fns in os.walk(root):
        for n in fns:
            if n.lower().endswith(".php"):
                count += 1
                total += 1
                if count <= 10:
                    print(root, os.path.join(dp,n))
    print("COUNT",root,count)
print("TOTAL_PHP_FILES", total)
PY

echo "=== docker state ==="
docker ps --format 'table {{.Names}}\\t{{.Image}}\\t{{.Status}}'
echo "=== disk ==="
df -h
`;

async function main() {
  const cfg = {
    ...loadKv(path.join(repoRoot, "deploy-server.config")),
    ...loadKv(path.join(repoRoot, "deploy-server.secrets")),
  };
  if (process.env.DEPLOY_SSH_PASSWORD) cfg.DEPLOY_SSH_PASSWORD = process.env.DEPLOY_SSH_PASSWORD.trim();
  const conn = await connect(cfg);
  const b64 = Buffer.from(cleanupScript, "utf8").toString("base64");
  const r = await execSsh(conn, `echo ${JSON.stringify(b64)} | base64 -d | bash`);
  conn.end();
  process.stdout.write(r.out);
  if (r.err) process.stderr.write(r.err);
  if (r.code !== 0) process.exit(r.code || 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
