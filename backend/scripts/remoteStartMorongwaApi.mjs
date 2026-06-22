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

async function main() {
  const cfg = {
    ...loadKv(path.join(repoRoot, "deploy-server.config")),
    ...loadKv(path.join(repoRoot, "deploy-server.secrets")),
  };
  if (process.env.DEPLOY_SSH_PASSWORD) cfg.DEPLOY_SSH_PASSWORD = process.env.DEPLOY_SSH_PASSWORD.trim();
  const conn = await connect(cfg);
  const cmd = [
    "docker rm -f morongwa-api-test >/dev/null 2>&1 || true",
    "docker run -d --name morongwa-api-test --restart unless-stopped --network shared-network -p 4010:4000 -v /home/zweppe/morongwa-live/backend:/app -w /app node:20-bullseye bash -lc 'npm install --include=dev && npm run build && npm run start'",
    "sleep 3",
    "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}' | sed -n '1,20p'",
    "docker logs --tail 60 morongwa-api-test || true",
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
