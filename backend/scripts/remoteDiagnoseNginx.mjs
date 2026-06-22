/**
 * SSH to production (deploy-server.config + deploy-server.secrets) and print
 * docker / curl / nginx-openresty snippets for qwertymates.com vs www debugging.
 *
 * Run from backend/:  node scripts/remoteDiagnoseNginx.mjs
 */
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
    const key = t.slice(0, i).trim().replace(/\r/g, "");
    let val = t.slice(i + 1).trim().replace(/\r/g, "");
    const hash = val.indexOf(" #");
    if (hash >= 0) val = val.slice(0, hash).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
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

function connect(cfg, secretsPath) {
  const { user, host } = parseHostUser(cfg);
  const password = (process.env.DEPLOY_SSH_PASSWORD || cfg.DEPLOY_SSH_PASSWORD || "").trim();
  if (!password) {
    throw new Error(`Missing DEPLOY_SSH_PASSWORD (env or ${secretsPath})`);
  }
  const port = parseInt(cfg.DEPLOY_SSH_PORT || "22", 10) || 22;
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => resolve(c))
      .on("error", reject)
      .connect({ host, username: user, password, port, readyTimeout: 120000 });
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
      stream.on("close", (code) => {
        resolve({ code: code ?? 0, stdout: out, stderr: err });
      });
    });
  });
}

// Avoid JS template `${...}` — use string concat so `$d` is not eaten.
const bash =
  [
    "set +e",
    'echo "========== docker morongwa-web-test =========="',
    "docker ps -a --format '{{.Names}} {{.Status}} {{.Ports}}' 2>/dev/null | grep -E morongwa || echo no_morongwa_match",
    'echo',
    'echo "========== curl upstream /wall =========="',
    "curl -sI --max-time 15 http://127.0.0.1:3010/wall 2>&1 | head -20",
    'echo',
    'echo "========== curl upstream / =========="',
    "curl -sI --max-time 15 http://127.0.0.1:3010/ 2>&1 | head -15",
    'echo',
    'echo "========== nginx / openresty =========="',
    "command -v openresty || true",
    "command -v nginx || true",
    "nginx -t 2>&1 || openresty -t 2>&1 || true",
    'echo',
    'echo "========== grep qwertymates /etc/nginx (head 80) =========="',
    "grep -RsnE 'server_name|proxy_pass|listen |qwertymates|3010' /etc/nginx 2>/dev/null | head -80 || true",
    'echo',
    'echo "========== grep qwertymates openresty (head 80) =========="',
    "grep -RsnE 'server_name|proxy_pass|listen |qwertymates|3010' /usr/local/openresty 2>/dev/null | head -80 || true",
    'echo',
    'echo "========== sites-enabled / conf.d =========="',
    "ls -la /etc/nginx/sites-enabled 2>/dev/null || true",
    "ls -la /etc/nginx/conf.d 2>/dev/null | head -40 || true",
  ].join("\n");

async function main() {
  const configPath = path.join(repoRoot, "deploy-server.config");
  const secretsPath = path.join(repoRoot, "deploy-server.secrets");
  const config = loadKv(configPath);
  const secrets = loadKv(secretsPath);
  const cfg = { ...config, ...secrets };
  if (process.env.DEPLOY_SSH_PASSWORD) cfg.DEPLOY_SSH_PASSWORD = process.env.DEPLOY_SSH_PASSWORD.trim();

  const conn = await connect(cfg, secretsPath);
  const b64 = Buffer.from(bash, "utf8").toString("base64");
  const r = await execSsh(conn, `echo ${JSON.stringify(b64)} | base64 -d | bash`);
  conn.end();
  console.log(r.stdout);
  if (r.stderr) console.error(r.stderr);
  process.exit(r.code === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
