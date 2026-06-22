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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
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
  return { user: (cfg.DEPLOY_SSH_USER || "root").trim(), host: raw.trim() };
}

function connect(cfg) {
  const { user, host } = parseHostUser(cfg);
  const password = (cfg.DEPLOY_SSH_PASSWORD || "").trim();
  const port = parseInt(cfg.DEPLOY_SSH_PORT || "22", 10) || 22;
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => resolve(c)).on("error", reject).connect({ host, username: user, password, port, readyTimeout: 120000 });
  });
}

function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (e) => (e ? reject(e) : resolve()));
    });
  });
}

function execSsh(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => process.stdout.write(String(d)));
      stream.stderr.on("data", (d) => process.stderr.write(String(d)));
      stream.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Remote exit ${code}`))));
    });
  });
}

async function main() {
  const cfg = { ...loadKv(path.join(repoRoot, "deploy-server.config")), ...loadKv(path.join(repoRoot, "deploy-server.secrets")) };
  const envPass = (process.env.DEPLOY_SSH_PASSWORD || "").trim();
  if (envPass) cfg.DEPLOY_SSH_PASSWORD = envPass;
  const liveDir = (cfg.MORONGWA_LIVE_DIR || "/home/zweppe/morongwa-live").replace(/\/$/, "");

  const fileMap = [
    {
      local: path.join(repoRoot, "frontend", "app", "checkout", "page.tsx"),
      remote: `${liveDir}/frontend/app/checkout/page.tsx`,
    },
    {
      local: path.join(repoRoot, "frontend", "app", "cart", "page.tsx"),
      remote: `${liveDir}/frontend/app/cart/page.tsx`,
    },
    {
      local: path.join(repoRoot, "frontend", "app", "profile", "page.tsx"),
      remote: `${liveDir}/frontend/app/profile/page.tsx`,
    },
    {
      local: path.join(repoRoot, "frontend", "app", "user", "[userId]", "page.tsx"),
      remote: `${liveDir}/frontend/app/user/[userId]/page.tsx`,
    },
    {
      local: path.join(repoRoot, "frontend", "app", "marketplace", "page.tsx"),
      remote: `${liveDir}/frontend/app/marketplace/page.tsx`,
    },
    {
      local: path.join(repoRoot, "frontend", "contexts", "CurrencyContext.tsx"),
      remote: `${liveDir}/frontend/contexts/CurrencyContext.tsx`,
    },
    {
      local: path.join(repoRoot, "frontend", "app", "wall", "page.tsx"),
      remote: `${liveDir}/frontend/app/wall/page.tsx`,
    },
    {
      local: path.join(repoRoot, "frontend", "app", "qwerty-music", "page.tsx"),
      remote: `${liveDir}/frontend/app/qwerty-music/page.tsx`,
    },
    {
      local: path.join(repoRoot, "frontend", "components", "AppSidebar.tsx"),
      remote: `${liveDir}/frontend/components/AppSidebar.tsx`,
    },
    {
      local: path.join(repoRoot, "frontend", "components", "ProfileHeaderButton.tsx"),
      remote: `${liveDir}/frontend/components/ProfileHeaderButton.tsx`,
    },
    {
      local: path.join(repoRoot, "frontend", "components", "tv", "TVGridTile.tsx"),
      remote: `${liveDir}/frontend/components/tv/TVGridTile.tsx`,
    },
  ];

  const conn = await connect(cfg);
  for (const f of fileMap) {
    console.log(`Uploading ${f.local} -> ${f.remote}`);
    await sftpPut(conn, f.local, f.remote);
  }
  console.log("Restarting frontend container...");
  await execSsh(conn, "docker restart morongwa-web-test && sleep 8 && curl -sI --max-time 20 http://127.0.0.1:3010/qwerty-music | head -n 15");
  conn.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
