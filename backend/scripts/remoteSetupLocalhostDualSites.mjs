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

const remoteScript = `
set -e
mkdir -p /home/zweppe/php-app
cat >/home/zweppe/php-app/index.php <<'PHP'
<?php
header('Content-Type: text/html; charset=utf-8');
echo '<h1>Legacy php-app placeholder</h1>';
echo '<p>This localhost php-app is ready. Upload old PHP files into /home/zweppe/php-app to fully restore legacy site.</p>';
echo '<p>Server time: '.date('Y-m-d H:i:s').'</p>';
?>
PHP

docker rm -f php-app-local >/dev/null 2>&1 || true
docker run -d --name php-app-local --restart unless-stopped --network shared-network -v /home/zweppe/php-app:/var/www/html php:8.2-apache

mkdir -p /home/zweppe/localhost-proxy
cat >/home/zweppe/localhost-proxy/default.conf <<'NGINX'
server {
  listen 80;
  server_name localhost 127.0.0.1;

  location = / {
    return 200 "localhost-only proxy is running\\nUse /morongwa and /php-app\\n";
    add_header Content-Type text/plain;
  }

  location /morongwa/ {
    proxy_pass http://morongwa-web-test:3010/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /php-app/ {
    proxy_pass http://php-app-local:80/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
NGINX

docker rm -f localhost-only-proxy >/dev/null 2>&1 || true
docker run -d --name localhost-only-proxy --restart unless-stopped --network shared-network -p 127.0.0.1:8088:80 -v /home/zweppe/localhost-proxy/default.conf:/etc/nginx/conf.d/default.conf:ro nginx:alpine

sleep 2
curl -sS -D - -o /dev/null http://127.0.0.1:8088/
curl -sS -D - -o /dev/null http://127.0.0.1:8088/php-app/
curl -sS -D - -o /dev/null http://127.0.0.1:8088/morongwa/wall
docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'
`;

async function main() {
  const cfg = {
    ...loadKv(path.join(repoRoot, "deploy-server.config")),
    ...loadKv(path.join(repoRoot, "deploy-server.secrets")),
  };
  if (process.env.DEPLOY_SSH_PASSWORD) cfg.DEPLOY_SSH_PASSWORD = process.env.DEPLOY_SSH_PASSWORD.trim();
  const conn = await connect(cfg);
  const b64 = Buffer.from(remoteScript, "utf8").toString("base64");
  const cmd = `echo ${JSON.stringify(b64)} | base64 -d | bash`;
  const r = await execSsh(conn, cmd);
  conn.end();
  process.stdout.write(r.out);
  if (r.err) process.stderr.write(r.err);
  if (r.code !== 0) process.exit(r.code || 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
