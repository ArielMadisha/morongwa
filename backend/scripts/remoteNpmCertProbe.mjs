/**
 * One-off: proxy_host 7 + certificate rows (NPM sqlite in nginx-app-1).
 * Run: cd backend && node scripts/remoteNpmCertProbe.mjs
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
    o[t.slice(0, i).trim()] = t.slice(i + 1).trim();
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
      stream.on("close", () => resolve(out));
    });
  });
}

const py = `
import sqlite3, json
c = sqlite3.connect("/data/database.sqlite")
cur = c.cursor()
cur.execute("SELECT id, domain_names, certificate_id, ssl_forced, enabled, forward_host, forward_port FROM proxy_host WHERE is_deleted=0 ORDER BY id")
for row in cur.fetchall():
    print("proxy_host", row)
cur.execute("PRAGMA table_info(certificate)")
print("cert_columns", [x[1] for x in cur.fetchall()])
cur.execute("SELECT id, nice_name, domain_names, provider, expires_on FROM certificate")
for row in cur.fetchall():
    print("certificate", row)
c.close()
`;

async function main() {
  const cfg = { ...loadKv(path.join(repoRoot, "deploy-server.config")), ...loadKv(path.join(repoRoot, "deploy-server.secrets")) };
  if (process.env.DEPLOY_SSH_PASSWORD) cfg.DEPLOY_SSH_PASSWORD = process.env.DEPLOY_SSH_PASSWORD.trim();
  const conn = await connect(cfg);
  const b64 = Buffer.from(py, "utf8").toString("base64");
  const out = await execSsh(conn, `docker exec nginx-app-1 sh -c 'echo ${b64} | base64 -d | python3'`);
  conn.end();
  console.log(out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
