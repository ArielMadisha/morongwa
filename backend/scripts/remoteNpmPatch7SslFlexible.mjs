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
import shutil, sys, re
path = "/data/nginx/proxy_host/7.conf"
try:
    with open(path, "r", encoding="utf-8") as f:
        s = f.read()
except OSError as e:
    print("ERR_READ", e)
    sys.exit(1)

if "listen 443 ssl;" not in s:
    if "listen [::]:80;" not in s:
        print("ERR_NO_LISTEN")
        sys.exit(1)
    s = s.replace("listen [::]:80;", "listen [::]:80;\\n\\n  listen 443 ssl;\\n  listen [::]:443 ssl;", 1)

if "include conf.d/include/force-ssl.conf;" not in s:
    m = re.search(r"server_name\\s+qwertymates\\.com\\s+www\\.qwertymates\\.com;", s)
    if not m:
        print("ERR_NO_SERVER_NAME")
        sys.exit(1)
    insert = """server_name qwertymates.com www.qwertymates.com;

  # Let's Encrypt SSL
  include conf.d/include/letsencrypt-acme-challenge.conf;
  include conf.d/include/ssl-ciphers.conf;
  ssl_certificate /etc/letsencrypt/live/npm-15/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/npm-15/privkey.pem;

  # Force SSL
  include conf.d/include/force-ssl.conf;"""
    s = s[:m.start()] + insert + s[m.end():]

# Ensure CSP header is present once.
s = re.sub(r"(?m)^\\s*add_header\\s+Content-Security-Policy\\s+.*?;\\s*$\\n?", "", s)
anchor = "server_name qwertymates.com www.qwertymates.com;"
idx = s.find(anchor)
if idx >= 0:
    insert_at = idx + len(anchor)
    csp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https://api.qwertymates.com https://www.qwertymates.com https:; media-src 'self' https://api.qwertymates.com data: blob:; frame-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self' https:;"
    header = "\\n  add_header Content-Security-Policy \\"" + csp + "\\" always;\\n"
    s = s[:insert_at] + header + s[insert_at:]

shutil.copy(path, path + ".bak.flex." + __import__("datetime").datetime.utcnow().strftime("%Y%m%d%H%M%S"))
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
