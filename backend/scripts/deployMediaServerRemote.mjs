/**
 * Remote: deploy nginx-rtmp + HLS Docker stack (infra/media-server), open firewall,
 * optionally merge livestream env keys into remote backend/.env and restart API.
 *
 * NPM / HTTPS in front of HLS must be completed in the UI (script prints exact steps).
 *
 * Prerequisites on VPS: Docker + compose plugin (or docker-compose).
 *
 * From backend/:
 *   npm run deploy:media-server-remote
 *   npm run deploy:media-server-remote -- --dry-run
 *   npm run deploy:media-server-remote -- --no-env   # skip .env merge + API restart
 *   npm run deploy:media-server-remote -- --no-firewall
 *
 * Local backend/.env should define (for --sync-env, default):
 *   LIVESTREAM_HLS_PUBLIC_BASE=https://live.example.com/hls
 *   LIVESTREAM_RTMP_PUBLIC_HOST=live.example.com
 *   LIVESTREAM_RTMP_APP=live   (optional)
 * Or set RTMP_INGEST_URL explicitly instead of host/app.
 *
 * Requires: deploy-server.config + deploy-server.secrets (and/or key in secrets / DEPLOY_SECRET).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  mergeDeployConfig,
  sshConnect,
  execSsh,
  loadKv,
} from "./lib/deploySsh.mjs";
import {
  upsertEnvLines,
  resolveRemoteBackendRoot,
  resolveRemoteRepoRoot,
  buildLivestreamEnvUpdates,
} from "./lib/livestreamRemoteEnv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");

function shSingleQuote(s) {
  return `'${String(s).replace(/'/g, `'\"'\"'`)}'`;
}

function sftpReadFile(conn, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.readFile(remotePath, (e, buf) => {
        if (e) {
          if (e.code === 2 || e.code === "ENOENT") return resolve(null);
          return reject(e);
        }
        resolve(buf.toString("utf8"));
      });
    });
  });
}

function sftpWriteFile(conn, remotePath, content) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.writeFile(remotePath, Buffer.from(content, "utf8"), (e) => {
        if (e) reject(e);
        else resolve();
      });
    });
  });
}

function sftpFastPut(conn, localPath, remotePath) {
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

async function uploadMediaFolder(conn, localDir, remoteDir) {
  await execSsh(conn, `mkdir -p ${shSingleQuote(remoteDir)}`);
  const names = fs.readdirSync(localDir);
  for (const name of names) {
    const lp = path.join(localDir, name);
    const st = fs.statSync(lp);
    if (!st.isFile()) continue;
    const rp = `${remoteDir.replace(/\/$/, "")}/${name}`;
    process.stdout.write(`==> put ${name} -> ${rp}\n`);
    await sftpFastPut(conn, lp, rp);
  }
}

function printNpmInstructions(cfg, build) {
  const { hls } = build;
  let hostHint = "";
  try {
    if (hls && /^https?:\/\//i.test(hls)) {
      hostHint = new URL(hls).hostname;
    }
  } catch {
    /* ignore */
  }
  const ip =
    (cfg.DEPLOY_SSH_HOST || "").includes("@") ?
      cfg.DEPLOY_SSH_HOST.split("@").pop().trim()
    : (cfg.DEPLOY_SSH_HOST || "").trim();

  console.log("\n========== Nginx Proxy Manager (HTTPS for HLS) — manual ==========");
  console.log("NPM cannot be configured safely via SSH without your UI/API token.");
  console.log("Add a Proxy Host:");
  console.log(`  • Domain names: ${hostHint || "(your HLS hostname, e.g. live.qwertymates.com)"}`);
  console.log("  • Scheme: http");
  console.log("  • Forward hostname / IP: 127.0.0.1");
  console.log("  • Forward port: 8081");
  console.log("  • Websockets Support: off (fine for HLS)");
  console.log("  • Block Common Exploits: on");
  console.log("  • SSL: Request a new Let's Encrypt certificate (force SSL).");
  console.log("HLS URLs look like: " + (hls ? `${hls}/STREAM_KEY.m3u8` : "https://<that-domain>/hls/<STREAM_KEY>.m3u8"));
  console.log("RTMP (OBS): rtmp://" + (hostHint || ip || "<hostname>") + "/live/<STREAM_KEY> (port 1935)");
  console.log("====================================================================\n");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const noEnv = process.argv.includes("--no-env");
  const noFirewall = process.argv.includes("--no-firewall");

  const cfg = mergeDeployConfig(repoRoot);
  const localMedia = path.join(repoRoot, "infra", "media-server");
  if (!fs.existsSync(localMedia)) {
    throw new Error(`Missing ${localMedia} — run from repo with infra/media-server present`);
  }

  const remoteRoot = resolveRemoteRepoRoot(cfg).replace(/\/$/, "");
  const remoteMedia = `${remoteRoot}/infra/media-server`;

  const localEnvPath = path.join(backendRoot, ".env");
  const local = fs.existsSync(localEnvPath) ? loadKv(localEnvPath) : {};
  const envBuild = buildLivestreamEnvUpdates(local);

  console.log("==> Remote repo root:", remoteRoot);
  console.log("==> Remote media dir:", remoteMedia);
  if (dryRun) {
    console.log("(dry-run) would upload infra/media-server, docker compose up, firewall, optional env sync");
    printNpmInstructions(cfg, envBuild);
    if (!envBuild.ok) {
      console.log("Note: local backend/.env missing HLS + RTMP config — set LIVESTREAM_HLS_PUBLIC_BASE and LIVESTREAM_RTMP_PUBLIC_HOST (or RTMP_INGEST_URL) before sync.");
    }
    return;
  }

  const conn = await sshConnect(cfg, repoRoot);

  console.log("==> Upload media stack...");
  await uploadMediaFolder(conn, localMedia, remoteMedia);

  console.log("==> docker compose up -d --build ...");
  const composeCmd =
    `cd ${shSingleQuote(remoteMedia)} && ` +
    `(docker compose version >/dev/null 2>&1 && docker compose up -d --build || docker-compose up -d --build)`;
  await execSsh(conn, `bash -lc ${shSingleQuote(composeCmd)}`);

  if (!noFirewall) {
    console.log("==> Firewall: allow 1935/tcp (RTMP), 8081/tcp (HLS HTTP behind NPM)...");
    await execSsh(
      conn,
      `bash -lc ${shSingleQuote(
        "command -v ufw >/dev/null 2>&1 && ufw allow 1935/tcp && ufw allow 8081/tcp && ufw reload || true"
      )}`
    );
  }

  console.log("==> Health check (non-fatal): GET http://127.0.0.1:8081/health");
  try {
    await execSsh(
      conn,
      `bash -lc ${shSingleQuote("(command -v curl >/dev/null && curl -sfS http://127.0.0.1:8081/health) || true")}`
    );
  } catch {
    console.warn("==> Health probe skipped or failed — check: docker ps | grep qwertymates-media");
  }

  if (!noEnv && envBuild.ok) {
    const remoteBackendRoot = resolveRemoteBackendRoot(cfg).replace(/\/$/, "");
    const remoteEnv = `${remoteBackendRoot}/.env`;
    const apiContainer = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim() || "morongwa-api-test";
    console.log("==> Merge livestream keys into", remoteEnv);
    let existing = null;
    try {
      existing = await sftpReadFile(conn, remoteEnv);
    } catch (e) {
      console.warn("==> Could not read remote .env:", String(e?.message || e));
    }
    const merged = upsertEnvLines(existing || "", envBuild.updates);
    await sftpWriteFile(conn, remoteEnv, merged);
    console.log("==> docker restart", apiContainer);
    await execSsh(conn, `docker restart ${shSingleQuote(apiContainer)}`);
  } else if (!noEnv && !envBuild.ok) {
    console.warn(
      "==> Skipping env merge: set LIVESTREAM_HLS_PUBLIC_BASE (or HLS_PLAYBACK_BASE_URL) and LIVESTREAM_RTMP_PUBLIC_HOST or RTMP_INGEST_URL in backend/.env, then run: npm run sync:livestream-env-remote"
    );
  }

  conn.end();

  printNpmInstructions(cfg, envBuild);
  const backendUrl = (local.BACKEND_URL || "https://api.qwertymates.com").replace(/\/$/, "");
  console.log("==> Done. Test:", `${backendUrl}/api/live/config`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
