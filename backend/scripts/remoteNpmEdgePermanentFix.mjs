/**
 * Permanent NPM edge hardening for qwertymates.com (proxy_host id=7 on this project):
 *
 * 1) Ensure /data/nginx/custom/server_proxy.conf does NOT duplicate `location /hls/`
 *    (duplicate breaks `nginx -t`, NPM deletes 7.conf → 502).
 * 2) Regenerate 7.conf via NPM internalNginx.configure(proxy_host, 7).
 * 3) If generated 7.conf lacks `listen 443` (NPM quirk), patch in Let’s Encrypt + force-ssl
 *    for certificate npm-15 (idempotent).
 * 4) nginx -t && nginx -s reload
 * 5) Smoke: openssl SNI www inside container + HTTP 200 to morongwa-web-test:3010/wall
 *
 * Run standalone: cd backend && node scripts/remoteNpmEdgePermanentFix.mjs
 * Skipped in deploy if env SKIP_NPM_EDGE_FIX=1
 *
 * Export: runEdgePermanentFix() for programmatic use.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function execSsh(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    conn.exec(cmd, (e, stream) => {
      if (e) return reject(e);
      stream.on("data", (d) => {
        out += String(d);
      });
      stream.stderr.on("data", (d) => {
        err += String(d);
      });
      stream.on("close", (code) => resolve({ code, stdout: out, stderr: err }));
    });
  });
}

const configureJs = `
process.chdir('/app');
process.env.NODE_ENV = 'production';
const proxyHostModel = require('./models/proxy_host');
const internalNginx = require('./internal/nginx');
proxyHostModel
  .query()
  .findById(7)
  .then((row) => {
    if (!row) throw new Error('proxy_host id=7 not found');
    return internalNginx.configure(proxyHostModel, 'proxy_host', row);
  })
  .then((meta) => {
    console.log('CONFIGURE_OK', JSON.stringify(meta));
    process.exit(0);
  })
  .catch((e) => {
    console.error('CONFIGURE_ERR', e && e.stack ? e.stack : String(e));
    process.exit(1);
  });
`;

const patchSslPy = `
import shutil, sys
path = "/data/nginx/proxy_host/7.conf"
try:
    with open(path, "r", encoding="utf-8") as f:
        s = f.read()
except OSError as e:
    print("ERR: cannot read", path, e)
    sys.exit(1)
if "listen 443" in s:
    print("SKIP_SSL_PATCH: already has listen 443")
    sys.exit(0)
if "www.qwertymates.com" not in s:
    print("ERR: unexpected 7.conf (no main site hostnames)")
    sys.exit(1)
mark = "listen [::]:80;"
a = s.find(mark)
if a < 0:
    print("ERR: no listen [::]:80 in 7.conf")
    sys.exit(1)
i = a + len(mark)
j = s.find("server_name", i)
if j < 0:
    print("ERR: no server_name after listen [::]:80")
    sys.exit(1)
k = s.find(";", j) + 1
server_line = s[j:k]
if "www.qwertymates.com" not in server_line and "qwertymates.com" not in server_line:
    print("ERR: first server_name line does not look like main site vhost")
    sys.exit(1)
shutil.copy(path, path + ".bak." + __import__("datetime").datetime.utcnow().strftime("%Y%m%d%H%M%S"))
# Same layout as other NPM hosts (e.g. api proxy_host/2.conf): 80 + 443, then server_name, then cert + force-ssl
insert = """

  listen 443 ssl;
  listen [::]:443 ssl;




""" + server_line + """

  # Let's Encrypt SSL
  include conf.d/include/letsencrypt-acme-challenge.conf;
  include conf.d/include/ssl-ciphers.conf;
  ssl_certificate /etc/letsencrypt/live/npm-15/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/npm-15/privkey.pem;

  # Force SSL
  include conf.d/include/force-ssl.conf;"""
s2 = s[:i] + insert + s[k:]
with open(path, "w", encoding="utf-8") as f:
    f.write(s2)
print("PATCHED_SSL", path)
`;

const patchCspPy = `
import re, shutil, sys
path = "/data/nginx/proxy_host/7.conf"
try:
    with open(path, "r", encoding="utf-8") as f:
        s = f.read()
except OSError as e:
    print("ERR: cannot read", path, e)
    sys.exit(1)

shutil.copy(path, path + ".bak.csp." + __import__("datetime").datetime.utcnow().strftime("%Y%m%d%H%M%S"))

# Remove any existing CSP response headers so we can apply one deterministic policy.
s = re.sub(r"(?m)^\\s*add_header\\s+Content-Security-Policy\\s+.*?;\\s*$\\n?", "", s)

csp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https://api.qwertymates.com https://www.qwertymates.com https:; media-src 'self' https://api.qwertymates.com data: blob:; frame-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self' https:;"
header_line = '  add_header Content-Security-Policy "' + csp + '" always;\\n'

m = re.search(r"^\\s*server_name\\s+[^;\\n]+www\\.qwertymates\\.com[^;]*;", s, re.MULTILINE)
if m:
    nlp = s.find("\\n", m.end())
    insert_at = nlp + 1 if nlp >= 0 else m.end() + 1
    s = s[:insert_at] + header_line + s[insert_at:]
    print("PATCHED_CSP", path)
else:
    print("SKIP_CSP: no vhost server_name line with www")

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
`;

/** NPM runs in Docker; 127.0.0.1:8081 inside nginx-app-1 is not the host where nginx-rtmp listens → 502 for /hls/. */
const patchHlsUpstreamPy = `
import sqlite3, os
gw = os.environ.get("NPM_HLS_UPSTREAM_HOST", "172.17.0.1")
path = "/data/database.sqlite"
con = sqlite3.connect(path)
cur = con.cursor()
row = cur.execute("SELECT advanced_config FROM proxy_host WHERE id=7").fetchone()
if row and row[0]:
    adv = row[0]
    new = adv.replace("http://127.0.0.1:8081/hls/", "http://" + gw + ":8081/hls/").replace(
        "http://localhost:8081/hls/", "http://" + gw + ":8081/hls/"
    )
    if new != adv:
        cur.execute("UPDATE proxy_host SET advanced_config=? WHERE id=7", (new,))
        con.commit()
        print("HLS_UPSTREAM_PATCHED", gw)
    else:
        print("HLS_UPSTREAM_OK")
con.close()
`;

export async function runEdgePermanentFix() {
  const cfgPath = path.join(repoRoot, "deploy-server.config");
  if (!fs.existsSync(cfgPath)) {
    console.log("remoteNpmEdgePermanentFix: skip (no deploy-server.config)");
    return;
  }
  const cfg = mergeDeployConfig(repoRoot);
  const conn = await sshConnect(cfg, repoRoot);

  const b64Configure = Buffer.from(configureJs, "utf8").toString("base64");
  const nodeConfigure = `echo ${JSON.stringify(b64Configure)} | base64 -d | node`;
  const b64Patch = Buffer.from(patchSslPy, "utf8").toString("base64");
  const b64PatchCsp = Buffer.from(patchCspPy, "utf8").toString("base64");
  const b64PatchHlsUpstream = Buffer.from(patchHlsUpstreamPy, "utf8").toString("base64");

  const step1 = [
    'echo "=== [4/4 edge] NPM: safe custom server_proxy (no duplicate /hls/) ==="',
    `docker exec nginx-app-1 sh -lc ${JSON.stringify("printf '%s\\n' '# /hls/ only in proxy_host advanced_config; do not duplicate here.' > /data/nginx/custom/server_proxy.conf")}`,
    'echo "=== [4/4 edge] NPM: HLS upstream loopback -> Docker bridge (host nginx-rtmp :8081) ==="',
    `docker exec nginx-app-1 sh -lc ${JSON.stringify(`echo ${JSON.stringify(b64PatchHlsUpstream)} | base64 -d | python3`)}`,
    'echo "=== [4/4 edge] NPM: internalNginx.configure(proxy_host 7) ==="',
    `docker exec nginx-app-1 sh -lc ${JSON.stringify(nodeConfigure)}`,
  ].join(" && ");

  const r1 = await execSsh(conn, `bash -lc ${JSON.stringify(step1)}`);
  console.log(r1.stdout);
  if (r1.stderr) console.error(r1.stderr);
  if (r1.code !== 0) {
    conn.end();
    throw new Error(`remoteNpmEdgePermanentFix step1 failed (exit ${r1.code})`);
  }

  const step2 = [
    'echo "=== [4/4 edge] NPM: SSL listen patch if missing ==="',
    `docker exec nginx-app-1 sh -lc ${JSON.stringify(`echo ${JSON.stringify(b64Patch)} | base64 -d | python3`)}`,
    'echo "=== [4/4 edge] NPM: CSP patch (allow API media/audio) ==="',
    `docker exec nginx-app-1 sh -lc ${JSON.stringify(`echo ${JSON.stringify(b64PatchCsp)} | base64 -d | python3`)}`,
    'docker exec nginx-app-1 nginx -t 2>&1',
    "docker exec nginx-app-1 nginx -s reload 2>&1",
    'echo "=== [4/4 edge] verify: listen 443 + SNI + upstream ==="',
    "docker exec nginx-app-1 sh -lc 'grep -n \"listen 443\" /data/nginx/proxy_host/7.conf || echo MISSING_443'",
    "docker exec nginx-app-1 sh -lc 'echo | openssl s_client -connect 127.0.0.1:443 -servername www.qwertymates.com 2>/dev/null | openssl x509 -noout -subject 2>/dev/null || true'",
    "curl -sI --max-time 15 http://127.0.0.1:3010/wall | head -5",
  ].join(" && ");

  const r2 = await execSsh(conn, `bash -lc ${JSON.stringify(step2)}`);
  conn.end();
  console.log(r2.stdout);
  if (r2.stderr) console.error(r2.stderr);
  if (r2.code !== 0) {
    throw new Error(`remoteNpmEdgePermanentFix step2 failed (exit ${r2.code})`);
  }
}

async function main() {
  if (process.env.SKIP_NPM_EDGE_FIX === "1") {
    console.log("SKIP_NPM_EDGE_FIX=1 — not running edge fix.");
    return;
  }
  await runEdgePermanentFix();
}

const __filename = fileURLToPath(import.meta.url);
const argvScript = process.argv[1] ? path.resolve(process.cwd(), process.argv[1]) : "";
const invokedAsCli = argvScript && path.normalize(argvScript) === path.normalize(__filename);
if (invokedAsCli) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
