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

const patchPy = `
import shutil, sys
path = "/data/nginx/proxy_host/2.conf"
try:
    with open(path, "r", encoding="utf-8") as f:
        s = f.read()
except OSError as e:
    print("ERR_READ", e)
    sys.exit(1)
if "listen 443 ssl;" in s:
    print("SKIP_ALREADY_PATCHED")
    sys.exit(0)
if "server_name api.qwertymates.com;" not in s:
    print("ERR_NO_SERVER_NAME")
    sys.exit(1)
shutil.copy(path, path + ".bak.ssl." + __import__("datetime").datetime.utcnow().strftime("%Y%m%d%H%M%S"))
needle = "listen [::]:80;"
if needle not in s:
    print("ERR_ANCHOR_1")
    sys.exit(1)
insert = """listen [::]:80;

  listen 443 ssl;
  listen [::]:443 ssl;
"""
s = s.replace(needle, insert, 1)
needle2 = "  server_name api.qwertymates.com;"
if needle2 not in s:
    print("ERR_ANCHOR_2")
    sys.exit(1)
insert2 = """  server_name api.qwertymates.com;

  # Let's Encrypt SSL
  include conf.d/include/letsencrypt-acme-challenge.conf;
  include conf.d/include/ssl-ciphers.conf;
  ssl_certificate /etc/letsencrypt/live/npm-3/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/npm-3/privkey.pem;

  # Force SSL
  include conf.d/include/force-ssl.conf;
"""
s = s.replace(needle2, insert2, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("PATCHED", path)
`;

async function main() {
  const cfg = {
    ...loadKv(path.join(repoRoot, "deploy-server.config")),
    ...loadKv(path.join(repoRoot, "deploy-server.secrets")),
  };
  if (process.env.DEPLOY_SSH_PASSWORD) cfg.DEPLOY_SSH_PASSWORD = process.env.DEPLOY_SSH_PASSWORD.trim();
  const conn = await connect(cfg);
  const b64 = Buffer.from(patchPy, "utf8").toString("base64");
  const cmd = [
    `docker exec nginx-app-1 sh -lc 'echo ${JSON.stringify(b64)} | base64 -d | python3'`,
    "docker exec nginx-app-1 nginx -t",
    "docker exec nginx-app-1 nginx -s reload",
  ].join(" && ");
  const r = await execSsh(conn, `bash -lc ${JSON.stringify(cmd)}`);
  conn.end();
  process.stdout.write(r.out);
  if (r.err) process.stderr.write(r.err);
  if (r.code !== 0) process.exit(r.code || 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
