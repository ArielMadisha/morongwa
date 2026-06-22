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

const cfg = { ...loadKv(path.join(repoRoot, "deploy-server.config")), ...loadKv(path.join(repoRoot, "deploy-server.secrets")) };
if (process.env.DEPLOY_SSH_PASSWORD) cfg.DEPLOY_SSH_PASSWORD = process.env.DEPLOY_SSH_PASSWORD.trim();

const raw = (cfg.DEPLOY_SSH_HOST || "").trim();
const user = raw.includes("@") ? raw.slice(0, raw.indexOf("@")) : "root";
const host = raw.includes("@") ? raw.slice(raw.indexOf("@") + 1) : raw;

const c = new Client();
c.on("ready", () => {
  c.exec("ss -tlnp | grep -E ':80|:443|:3010|:4010' ; echo DONE", (e, stream) => {
    let o = "";
    stream.on("data", (d) => {
      o += d;
    });
    stream.stderr.on("data", (d) => {
      o += d;
    });
    stream.on("close", () => {
      console.log(o);
      c.end();
    });
  });
})
  .on("error", (e) => {
    console.error(e);
    process.exit(1);
  })
  .connect({
    host,
    username: user,
    password: cfg.DEPLOY_SSH_PASSWORD,
    port: parseInt(cfg.DEPLOY_SSH_PORT || "22", 10) || 22,
    readyTimeout: 120000,
  });
