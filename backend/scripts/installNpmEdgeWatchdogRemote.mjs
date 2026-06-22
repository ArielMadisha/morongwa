/**
 * Install a persistent self-healing watchdog for NPM proxy_host 7.
 *
 * Problem addressed:
 * - Every ~1-2 days NPM can regenerate /data/nginx/proxy_host/7.conf without listen 443
 *   or with broken /hls/ duplication, causing intermittent 502.
 *
 * Solution:
 * - Install /usr/local/bin/qwertymates-edge-watchdog.sh on the server
 * - Run it every 5 minutes via cron
 * - If 7.conf is missing/broken, re-apply the same safe remediation automatically
 */
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
    c.on("ready", () => resolve(c)).on("error", reject).connect({
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
    conn.exec(cmd, (e, stream) => {
      if (e) return reject(e);
      stream.on("data", (d) => {
        out += String(d);
      });
      stream.stderr.on("data", (d) => {
        out += String(d);
      });
      stream.on("close", (code) => {
        if (code === 0) resolve(out);
        else reject(new Error(out || `remote command failed (${code})`));
      });
    });
  });
}

const watchdogSh = `#!/usr/bin/env bash
set -euo pipefail

CID="nginx-app-1"
PH="/data/nginx/proxy_host/7.conf"
SP="/data/nginx/custom/server_proxy.conf"
GW="\${NPM_HLS_UPSTREAM_HOST:-172.17.0.1}"

docker ps --format '{{.Names}}' | grep -qx "$CID" || exit 0

NEEDS_FIX=0
if ! docker exec "$CID" sh -lc "test -f '$PH'"; then
  NEEDS_FIX=1
fi
if ! docker exec "$CID" sh -lc "grep -q 'listen 443 ssl;' '$PH'"; then
  NEEDS_FIX=1
fi

if [ "$NEEDS_FIX" -eq 0 ]; then
  exit 0
fi

docker exec "$CID" sh -lc "printf '%s\\n' '# /hls/ only in proxy_host advanced_config; do not duplicate here.' > '$SP'"
docker exec "$CID" sh -lc "python3 - <<'PY'
import sqlite3, os
gw=os.environ.get('NPM_HLS_UPSTREAM_HOST','172.17.0.1')
con=sqlite3.connect('/data/database.sqlite')
cur=con.cursor()
row=cur.execute('SELECT advanced_config FROM proxy_host WHERE id=7').fetchone()
if row and row[0]:
    adv=row[0]
    new=adv.replace('http://127.0.0.1:8081/hls/','http://'+gw+':8081/hls/').replace('http://localhost:8081/hls/','http://'+gw+':8081/hls/')
    if new!=adv:
        cur.execute('UPDATE proxy_host SET advanced_config=? WHERE id=7',(new,))
        con.commit()
con.close()
PY"

docker exec "$CID" sh -lc "cd /app && node - <<'NODE'
process.chdir('/app');
process.env.NODE_ENV='production';
const proxyHostModel=require('./models/proxy_host');
const internalNginx=require('./internal/nginx');
proxyHostModel.query().findById(7).then((row)=>{
  if(!row) throw new Error('proxy_host id=7 missing');
  return internalNginx.configure(proxyHostModel,'proxy_host',row);
}).then(()=>process.exit(0)).catch((e)=>{ console.error(e&&e.stack?e.stack:String(e)); process.exit(1); });
NODE"

docker exec "$CID" sh -lc "python3 - <<'PY'
import sys
p='/data/nginx/proxy_host/7.conf'
with open(p,'r',encoding='utf-8') as f: s=f.read()
if 'listen 443 ssl;' in s:
    sys.exit(0)
i=s.find('listen [::]:80;')
if i<0: raise SystemExit('no listen [::]:80')
i += len('listen [::]:80;')
j=s.find('server_name',i)
k=s.find(';',j)+1
server_line=s[j:k]
insert='\\n\\n  listen 443 ssl;\\n  listen [::]:443 ssl;\\n\\n'+server_line+'\\n\\n  # Let\\'s Encrypt SSL\\n  include conf.d/include/letsencrypt-acme-challenge.conf;\\n  include conf.d/include/ssl-ciphers.conf;\\n  ssl_certificate /etc/letsencrypt/live/npm-15/fullchain.pem;\\n  ssl_certificate_key /etc/letsencrypt/live/npm-15/privkey.pem;\\n\\n  # Force SSL\\n  include conf.d/include/force-ssl.conf;'
s=s[:i]+insert+s[k:]
with open(p,'w',encoding='utf-8') as f: f.write(s)
PY"

docker exec "$CID" nginx -t >/dev/null
docker exec "$CID" nginx -s reload >/dev/null
echo "$(date -Is) edge watchdog repaired proxy_host/7"
`;

async function main() {
  const cfgPath = path.join(repoRoot, "deploy-server.config");
  if (!fs.existsSync(cfgPath)) {
    console.log("installNpmEdgeWatchdogRemote: skip (no deploy-server.config)");
    return;
  }
  const cfg = { ...loadKv(cfgPath), ...loadKv(path.join(repoRoot, "deploy-server.secrets")) };
  if (process.env.DEPLOY_SSH_PASSWORD) cfg.DEPLOY_SSH_PASSWORD = process.env.DEPLOY_SSH_PASSWORD.trim();
  if (!(cfg.DEPLOY_SSH_HOST || "").trim() || !(cfg.DEPLOY_SSH_PASSWORD || "").trim()) {
    console.log("installNpmEdgeWatchdogRemote: skip (missing deploy ssh config)");
    return;
  }
  const conn = await connect(cfg);
  const b64 = Buffer.from(watchdogSh, "utf8").toString("base64");
  const cmd = [
    `echo ${JSON.stringify(b64)} | base64 -d > /usr/local/bin/qwertymates-edge-watchdog.sh`,
    "chmod +x /usr/local/bin/qwertymates-edge-watchdog.sh",
    "(crontab -l 2>/dev/null | grep -v 'qwertymates-edge-watchdog.sh' || true; echo '*/5 * * * * /usr/local/bin/qwertymates-edge-watchdog.sh >> /var/log/qwertymates-edge-watchdog.log 2>&1') | crontab -",
    "/usr/local/bin/qwertymates-edge-watchdog.sh || true",
    "echo WATCHDOG_INSTALLED",
  ].join(" && ");
  const out = await execSsh(conn, `bash -lc ${JSON.stringify(cmd)}`);
  conn.end();
  console.log(out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

