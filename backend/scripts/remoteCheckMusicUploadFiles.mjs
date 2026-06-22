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
    o[t.slice(0, i).trim()] = t.slice(i + 1).trim().split(" #")[0].trim();
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
    c.on("ready", () => resolve(c)).on("error", reject).connect({ host, username: user, password, port: 22, readyTimeout: 120000 });
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
  const cfg = { ...loadKv(path.join(repoRoot, "deploy-server.config")), ...loadKv(path.join(repoRoot, "deploy-server.secrets")) };
  if (process.env.DEPLOY_SSH_PASSWORD) cfg.DEPLOY_SSH_PASSWORD = process.env.DEPLOY_SSH_PASSWORD.trim();
  const conn = await connect(cfg);
  const script = `
set +e
echo "HOST backend uploads:"
ls -la /home/zweppe/morongwa-live/backend/uploads
echo
echo "HOST backend uploads/music:"
ls -la /home/zweppe/morongwa-live/backend/uploads/music
echo
echo "HOST backend dist/uploads:"
ls -la /home/zweppe/morongwa-live/backend/dist/uploads
echo
echo "HOST backend dist/uploads/music:"
ls -la /home/zweppe/morongwa-live/backend/dist/uploads/music
echo
echo "CONTAINER /app/uploads:"
docker exec morongwa-api-test sh -lc 'ls -la /app/uploads'
echo
echo "CONTAINER /app/uploads/music:"
docker exec morongwa-api-test sh -lc 'ls -la /app/uploads/music'
`;
  const b64 = Buffer.from(script, "utf8").toString("base64");
  const r = await execSsh(conn, `echo ${JSON.stringify(b64)} | base64 -d | bash`);
  conn.end();
  process.stdout.write(r.out);
  if (r.err) process.stderr.write(r.err);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
