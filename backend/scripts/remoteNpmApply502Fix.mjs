/**
 * On the deploy host (Nginx Proxy Manager in docker nginx-app-1):
 * 1) Backup database.sqlite
 * 2) Fix proxy_host id=7 advanced_config (remove bad PowerShell Host header from /hls/ snippet)
 * 3) Scope proxy_host id=7 to www only; add redirection_host apex -> www (301, preserve path)
 * 4) Restart nginx-app-1
 *
 * Run: cd backend && node scripts/remoteNpmApply502Fix.mjs
 *
 * After raw SQLite edits, NPM may not rewrite /data/nginx/proxy_host/*.conf until the UI saves
 * that host (internalNginx.configure). Open NPM → Proxy Hosts → edit the www.qwertymates.com
 * entry → Save once so disk matches the DB. For apex→www, add or re-save a Redirection Host in
 * the UI if /data/nginx/redirection_host/ stays empty.
 *
 * Do not define `location /hls/` in both proxy advanced_config and
 * `/data/nginx/custom/server_proxy.conf` — duplicate locations make `nginx -t` fail and NPM
 * deletes `proxy_host/7.conf`, breaking HTTPS (ERR_SSL_UNRECOGNIZED_NAME_ALERT). Use
 * `remoteNpmEdgePermanentFix.mjs` (also step 4 of `npm run deploy:production`) or
 * `remoteNpmFixHlsDuplicate.mjs` (wrapper) if that happens.
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

const py = `
import sqlite3, json, datetime, shutil, os

DB = "/data/database.sqlite"
backup = "/data/database.sqlite.bak." + datetime.datetime.utcnow().strftime("%Y%m%d%H%M%S")
shutil.copy2(DB, backup)
print("BACKUP", backup)

fixed_hls = """location ^~ /hls/ {
  proxy_pass http://127.0.0.1:8081/hls/;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_http_version 1.1;
  add_header Access-Control-Allow-Origin *;
  add_header Access-Control-Allow-Headers *;
}
"""

c = sqlite3.connect(DB)
cur = c.cursor()

cur.execute("SELECT id, owner_user_id, certificate_id, ssl_forced FROM proxy_host WHERE id=7")
row = cur.fetchone()
if not row:
    raise SystemExit("proxy_host id=7 missing")
ph_id, owner_user_id, cert_id, ssl_forced = row
print("proxy_host 7 owner", owner_user_id, "cert", cert_id)

cur.execute(
    "UPDATE proxy_host SET domain_names = ?, advanced_config = ?, modified_on = datetime('now') WHERE id = 7",
    (json.dumps(["www.qwertymates.com"]), fixed_hls),
)
print("updated proxy_host 7 -> www only + fixed /hls/ snippet")

cur.execute("SELECT COUNT(*) FROM redirection_host WHERE domain_names = ? AND is_deleted = 0", (json.dumps(["qwertymates.com"]),))
if cur.fetchone()[0] == 0:
    cur.execute(
        """INSERT INTO redirection_host (
            created_on, modified_on, owner_user_id, is_deleted,
            domain_names, forward_domain_name, preserve_path, certificate_id,
            ssl_forced, block_exploits, advanced_config, meta, http2_support,
            enabled, hsts_enabled, hsts_subdomains, forward_scheme, forward_http_code
        ) VALUES (
            datetime('now'), datetime('now'), ?, 0,
            ?, ?, 1, ?,
            1, 0, '', '{}', 0,
            1, 0, 0, 'https', 301
        )""",
        (owner_user_id, json.dumps(["qwertymates.com"]), "www.qwertymates.com", cert_id),
    )
    print("inserted redirection_host qwertymates.com -> www (301)")
else:
    print("redirection_host for qwertymates.com already exists; skip insert")

c.commit()
c.close()
print("OK")
`;

async function main() {
  const cfg = { ...loadKv(path.join(repoRoot, "deploy-server.config")), ...loadKv(path.join(repoRoot, "deploy-server.secrets")) };
  if (process.env.DEPLOY_SSH_PASSWORD) cfg.DEPLOY_SSH_PASSWORD = process.env.DEPLOY_SSH_PASSWORD.trim();
  const conn = await connect(cfg);

  const b64 = Buffer.from(py, "utf8").toString("base64");
  // Single-line bash -c body avoids multiline/quoting edge cases with ssh2.
  const remoteScript = [
    `docker exec nginx-app-1 sh -c 'echo ${JSON.stringify(b64)} | base64 -d | python3'`,
    "docker restart nginx-app-1",
    "sleep 8",
    "docker ps --format '{{.Names}} {{.Status}}' | grep nginx-app-1 || true",
  ].join(" && ");

  const r = await execSsh(conn, `bash -lc ${JSON.stringify(remoteScript)}`);
  conn.end();
  console.log(r.stdout);
  if (r.stderr) console.error(r.stderr);
  if (r.code !== 0) process.exit(r.code || 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
