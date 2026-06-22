/**
 * Run NPM internalNginx.configure for proxy_host id=7 (recreates /data/nginx/proxy_host/7.conf).
 * Run: cd backend && node scripts/remoteNpmConfigureProxy7.mjs
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

const js = `
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
  })
  .catch((e) => {
    console.error('CONFIGURE_ERR', e && e.stack ? e.stack : String(e));
    process.exit(1);
  });
`;

async function main() {
  const cfg = { ...loadKv(path.join(repoRoot, "deploy-server.config")), ...loadKv(path.join(repoRoot, "deploy-server.secrets")) };
  if (process.env.DEPLOY_SSH_PASSWORD) cfg.DEPLOY_SSH_PASSWORD = process.env.DEPLOY_SSH_PASSWORD.trim();
  const conn = await connect(cfg);
  const b64 = Buffer.from(js, "utf8").toString("base64");
  const remote = `timeout 90 docker exec nginx-app-1 sh -lc 'echo ${JSON.stringify(b64)} | base64 -d | node' ; echo EXIT:$?`;
  const r = await execSsh(conn, remote);
  conn.end();
  console.log(r.stdout);
  if (r.stderr) console.error(r.stderr);
  if (r.code !== 0) process.exit(r.code || 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
