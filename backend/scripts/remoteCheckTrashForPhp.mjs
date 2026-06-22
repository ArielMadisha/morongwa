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

const script = `
set +e
echo "==== root trash ===="
ls -la /root/.local/share/Trash/files 2>/dev/null || echo "no root trash files"
ls -la /root/.local/share/Trash/info 2>/dev/null || echo "no root trash info"
echo
echo "==== zweppe trash ===="
ls -la /home/zweppe/.local/share/Trash/files 2>/dev/null || echo "no zweppe trash files"
ls -la /home/zweppe/.local/share/Trash/info 2>/dev/null || echo "no zweppe trash info"
echo
echo "==== harshalnikam trash ===="
ls -la /home/harshalnikam/.local/share/Trash/files 2>/dev/null || echo "no harshalnikam trash files"
ls -la /home/harshalnikam/.local/share/Trash/info 2>/dev/null || echo "no harshalnikam trash info"
echo
echo "==== candidate files in trash ===="
python3 - <<'PY'
import os
roots = [
    "/root/.local/share/Trash/files",
    "/home/zweppe/.local/share/Trash/files",
    "/home/harshalnikam/.local/share/Trash/files",
]
for r in roots:
    if not os.path.isdir(r):
        print("MISSING", r)
        continue
    print("SCAN", r)
    found = 0
    for dp, _, fns in os.walk(r):
        for n in fns:
            lower = n.lower()
            if lower.endswith((".php", ".zip", ".tar", ".gz", ".tgz")) or "php" in lower or "morongwa" in lower:
                p = os.path.join(dp, n)
                try:
                    size = os.path.getsize(p)
                except OSError:
                    size = -1
                print(size, p)
                found += 1
    print("FOUND", found)
PY
`;

async function main() {
  const cfg = {
    ...loadKv(path.join(repoRoot, "deploy-server.config")),
    ...loadKv(path.join(repoRoot, "deploy-server.secrets")),
  };
  if (process.env.DEPLOY_SSH_PASSWORD) cfg.DEPLOY_SSH_PASSWORD = process.env.DEPLOY_SSH_PASSWORD.trim();
  const conn = await connect(cfg);
  const b64 = Buffer.from(script, "utf8").toString("base64");
  const r = await execSsh(conn, `echo ${JSON.stringify(b64)} | base64 -d | bash`);
  conn.end();
  process.stdout.write(r.out);
  if (r.err) process.stderr.write(r.err);
  if (r.code !== 0) process.exit(r.code || 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
