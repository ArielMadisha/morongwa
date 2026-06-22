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
    let val = t.slice(i + 1).trim();
    const h = val.indexOf(" #");
    if (h >= 0) val = val.slice(0, h).trim();
    o[t.slice(0, i).trim()] = val;
  }
  return o;
}

function connect(cfg) {
  const raw = (cfg.DEPLOY_SSH_HOST || "").trim();
  const user = raw.includes("@") ? raw.slice(0, raw.indexOf("@")) : cfg.DEPLOY_SSH_USER || "root";
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

const bash = [
  "set +e",
  "echo '### nginx.conf ###'",
  "cat /etc/nginx/nginx.conf 2>/dev/null",
  "echo",
  "echo '### conf.d ###'",
  "for f in /etc/nginx/conf.d/*.conf; do echo '---' $f; cat $f 2>/dev/null; done",
  "echo",
  "echo '### listen ports ###'",
  "ss -tlnp 2>/dev/null | head -40",
  "echo",
  "echo '### curl public with resolve (optional) ###'",
  "curl -sI --max-time 10 https://127.0.0.1/ -H 'Host: qwertymates.com' --insecure 2>&1 | head -15 || true",
].join("\n");

async function main() {
  const cfg = { ...loadKv(path.join(repoRoot, "deploy-server.config")), ...loadKv(path.join(repoRoot, "deploy-server.secrets")) };
  if (process.env.DEPLOY_SSH_PASSWORD) cfg.DEPLOY_SSH_PASSWORD = process.env.DEPLOY_SSH_PASSWORD.trim();
  const conn = await connect(cfg);
  const out = await execSsh(conn, `echo ${JSON.stringify(Buffer.from(bash, "utf8").toString("base64"))} | base64 -d | bash`);
  conn.end();
  console.log(out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
