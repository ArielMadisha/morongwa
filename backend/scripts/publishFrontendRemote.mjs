/**
 * Upload frontend tarball + refresh script over SSH (password auth).
 * Reads repo-root deploy-server.config + deploy-server.secrets (gitignored).
 *
 * Setup:
 *   cp deploy-server.config.example deploy-server.config
 *   cp deploy-server.secrets.example deploy-server.secrets
 *   # edit both; never commit deploy-server.secrets
 *
 * Run from backend/:
 *   node scripts/publishFrontendRemote.mjs
 *   node scripts/publishFrontendRemote.mjs --rebuild
 *
 * Password: deploy-server.secrets must contain DEPLOY_SSH_PASSWORD=yourpass (not empty after =).
 * Or set env DEPLOY_SSH_PASSWORD for one session (PowerShell: $env:DEPLOY_SSH_PASSWORD='...')
 */
import { Client } from "ssh2";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

function loadKv(absPath) {
  const o = {};
  if (!fs.existsSync(absPath)) return o;
  let text = fs.readFileSync(absPath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // UTF-8 BOM
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
  const host = raw;
  const user = (cfg.DEPLOY_SSH_USER || "root").trim();
  if (!host) throw new Error("Set DEPLOY_SSH_HOST in deploy-server.config");
  return { user, host };
}

function mergeDeployConfig() {
  const config = loadKv(path.join(repoRoot, "deploy-server.config"));
  const secrets = loadKv(path.join(repoRoot, "deploy-server.secrets"));
  return { ...config, ...secrets };
}

function buildTarball() {
  const stage = path.join(repoRoot, "_pack_frontend");
  const dest = path.join(stage, "morongwa-frontend-only");
  const frontend = path.join(repoRoot, "frontend");
  const out = path.join(repoRoot, "morongwa-frontend-only.tgz");

  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  if (process.platform === "win32") {
    try {
      execSync(
        `robocopy "${frontend}" "${dest}" /MIR /XD node_modules .next /NFL /NDL /NJH /NJS /nc /ns /np`,
        { stdio: "inherit", windowsHide: true }
      );
    } catch (e) {
      const code = e.status ?? e.code;
      if (typeof code === "number" && code >= 8) throw e;
    }
  } else {
    execSync(
      `rsync -a --delete --exclude=node_modules --exclude=.next "${frontend}/" "${dest}/"`,
      { stdio: "inherit" }
    );
  }

  fs.rmSync(out, { force: true });
  execSync(`tar -czf "${out}" -C "${stage}" morongwa-frontend-only`, { stdio: "inherit" });
  const mb = (fs.statSync(out).size / (1024 * 1024)).toFixed(2);
  console.log(`Wrote ${out} (${mb} MB)`);
}

function connect(cfg, secretsPath) {
  const { user, host } = parseHostUser(cfg);
  const password = (cfg.DEPLOY_SSH_PASSWORD || "").trim();
  if (!password) {
    throw new Error(
      "DEPLOY_SSH_PASSWORD is missing or empty.\n\n" +
        "Fix one of these:\n" +
        `  1) Edit ${secretsPath} — one line, no spaces around =, password right after =:\n` +
        "     DEPLOY_SSH_PASSWORD=YourActualRootPassword\n" +
        "  2) Or PowerShell (session only):\n" +
        "     $env:DEPLOY_SSH_PASSWORD='YourActual'\n" +
        "     npm run deploy:frontend-remote:rebuild\n\n" +
        "Your file currently has DEPLOY_SSH_PASSWORD= with nothing after the = sign."
    );
  }
  const port = parseInt(cfg.DEPLOY_SSH_PORT || "22", 10) || 22;
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => resolve(c))
      .on("error", reject)
      .connect({
        host,
        username: user,
        password,
        port,
        readyTimeout: 120000,
      });
  });
}

function execSsh(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => process.stdout.write(String(d)));
      stream.stderr.on("data", (d) => process.stderr.write(String(d)));
      stream.on("close", (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`Remote command exited ${code}${signal ? ` (${signal})` : ""}`));
      });
    });
  });
}

function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (e) => {
        if (e) reject(e);
        else resolve();
      });
    });
  });
}

async function main() {
  const configPath = path.join(repoRoot, "deploy-server.config");
  const secretsPath = path.join(repoRoot, "deploy-server.secrets");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing deploy-server.config — copy deploy-server.config.example to ${configPath}`);
  }
  const envPass = (process.env.DEPLOY_SSH_PASSWORD || "").trim();
  if (!envPass && !fs.existsSync(secretsPath)) {
    throw new Error(
      `Missing deploy-server.secrets at:\n  ${secretsPath}\n` +
        "Or set environment variable DEPLOY_SSH_PASSWORD for this session only."
    );
  }

  const rebuild = process.argv.includes("--rebuild");
  const cfg = mergeDeployConfig();
  if (envPass) cfg.DEPLOY_SSH_PASSWORD = envPass;

  const tarball = path.join(repoRoot, "morongwa-frontend-only.tgz");
  if (rebuild || !fs.existsSync(tarball)) {
    console.log("==> Building tarball...");
    buildTarball();
  }

  const staging = (cfg.MORONGWA_STAGING_PARENT || "/root").replace(/\/$/, "");
  const liveDir = (cfg.MORONGWA_LIVE_DIR || "/var/www/morongwa").replace(/\/$/, "");
  const remoteTgz =
    (cfg.MORONGWA_FRONTEND_TGZ || `${staging}/morongwa-frontend-only.tgz`).trim();
  const remoteScript = `${staging}/remote_refresh_frontend_test.sh`;
  const localScript = path.join(repoRoot, "backend", "scripts", "remote_refresh_frontend_test.sh");

  if (!fs.existsSync(localScript)) throw new Error(`Missing ${localScript}`);

  console.log("==> Connecting SSH...");
  const conn = await connect(cfg, secretsPath);

  console.log(`==> Upload tarball -> ${remoteTgz}`);
  await sftpPut(conn, tarball, remoteTgz);

  console.log(`==> Upload refresh script -> ${remoteScript}`);
  await sftpPut(conn, localScript, remoteScript);

  const exports = `export MORONGWA_STAGING_PARENT="${staging}" MORONGWA_LIVE_DIR="${liveDir}" MORONGWA_FRONTEND_TGZ="${remoteTgz}"`;
  const run = `sed -i 's/\\r$//' "${remoteScript}" && chmod +x "${remoteScript}" && ${exports} && bash "${remoteScript}"`;
  console.log("==> Running remote Docker refresh (may take several minutes)...");
  await execSsh(conn, run);

  conn.end();
  console.log("==> Done. Try https://qwertymates.com/login in a private window.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
