import { Client } from "ssh2";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

function loadKv(absPath) {
  const o = {};
  if (!fs.existsSync(absPath)) return o;
  let text = fs.readFileSync(absPath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    const hash = val.indexOf(" #");
    if (hash >= 0) val = val.slice(0, hash).trim();
    o[key] = val;
  }
  return o;
}

function parseHostUser(cfg) {
  const raw = (cfg.DEPLOY_SSH_HOST || "").trim();
  if (raw.includes("@")) {
    const at = raw.indexOf("@");
    return { user: raw.slice(0, at).trim(), host: raw.slice(at + 1).trim() };
  }
  return { user: (cfg.DEPLOY_SSH_USER || "root").trim(), host: raw };
}

function connect(cfg) {
  const { user, host } = parseHostUser(cfg);
  const password = (process.env.DEPLOY_SSH_PASSWORD || cfg.DEPLOY_SSH_PASSWORD || "").trim();
  if (!password) throw new Error("DEPLOY_SSH_PASSWORD missing");
  const port = parseInt(cfg.DEPLOY_SSH_PORT || "22", 10) || 22;
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => resolve(c)).on("error", reject).connect({ host, username: user, password, port, readyTimeout: 120000 });
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
      stream.on("close", (code) => resolve({ code: code ?? 0, stdout: out, stderr: err }));
    });
  });
}

const bash = [
  "set +e",
  'echo "=== grep qwertymates /etc ==="',
  "grep -Rsn qwertymates /etc/nginx 2>/dev/null | head -100",
  "grep -Rsn qwertymates /usr/local/openresty 2>/dev/null | head -50",
  'echo "=== grep 3010 /etc/nginx ==="',
  "grep -Rsn 3010 /etc/nginx 2>/dev/null | head -80",
  'echo "=== ls /etc/nginx/sites-available ==="',
  "ls -la /etc/nginx/sites-available 2>/dev/null",
  'echo "=== sites-enabled symlinks ==="',
  "ls -la /etc/nginx/sites-enabled 2>/dev/null",
].join("\n");

async function main() {
  const cfg = { ...loadKv(path.join(repoRoot, "deploy-server.config")), ...loadKv(path.join(repoRoot, "deploy-server.secrets")) };
  if (process.env.DEPLOY_SSH_PASSWORD) cfg.DEPLOY_SSH_PASSWORD = process.env.DEPLOY_SSH_PASSWORD.trim();
  const conn = await connect(cfg);
  const b64 = Buffer.from(bash, "utf8").toString("base64");
  const r = await execSsh(conn, `echo ${JSON.stringify(b64)} | base64 -d | bash`);
  conn.end();
  console.log(r.stdout);
  if (r.stderr) console.error(r.stderr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
