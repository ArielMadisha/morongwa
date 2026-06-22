/**
 * Upload frontend tarball + refresh script over SSH.
 * Reads repo-root deploy-server.config + deploy-server.secrets (gitignored).
 * Auth: password and/or OpenSSH private key (see deploy-server.secrets.example, lib/deploySsh.mjs).
 *
 * Run from backend/:
 *   node scripts/publishFrontendRemote.mjs
 *   node scripts/publishFrontendRemote.mjs --use-cached-tgz   (skip repack; rare / dev only)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

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

  const useCachedTgz = process.argv.includes("--use-cached-tgz");
  const cfg = mergeDeployConfig(repoRoot);
  if (envPass) cfg.DEPLOY_SSH_PASSWORD = envPass;

  const tarball = path.join(repoRoot, "morongwa-frontend-only.tgz");
  // Default: always pack from local frontend/. A stale repo-root tarball previously caused
  // "no UI changes" on www after edits when this script reused an old .tgz.
  if (useCachedTgz && fs.existsSync(tarball)) {
    console.log("==> Using existing tarball (--use-cached-tgz).");
  } else {
    console.log("==> Building tarball from local frontend/...");
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
  const conn = await sshConnect(cfg, repoRoot, { secretsPath });

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
