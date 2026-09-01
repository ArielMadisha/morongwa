/**
 * Deploy Qwertz video service to production VPS (Docker + FFmpeg on shared-network).
 *
 * From backend/:
 *   npm run deploy:qwertz-remote
 *   npm run deploy:qwertz-remote -- --dry-run
 *   npm run deploy:qwertz-remote -- --no-env-sync
 *
 * Requires: deploy-server.config + deploy-server.secrets
 * Qwertz source: sibling ../Qwertz or QWERTZ_LOCAL_DIR
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { mergeDeployConfig, sshConnect, execSsh, loadKv } from "./lib/deploySsh.mjs";
import {
  buildQwertzEnvUpdates,
  buildQwertzServiceEnv,
  resolveLocalQwertzRoot,
  resolveRemoteQwertzRoot,
  upsertLocalEnvFile,
} from "./lib/qwertzDeploy.mjs";
import { upsertEnvLines, resolveRemoteBackendRoot } from "./lib/livestreamRemoteEnv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");

function shSingleQuote(s) {
  return `'${String(s).replace(/'/g, `'\"'\"'`)}'`;
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

function buildQwertzTarball(qwertzRoot) {
  const out = path.join(repoRoot, "qwertz-deploy.tgz");
  fs.rmSync(out, { force: true });

  if (process.platform === "win32") {
    const stage = path.join(repoRoot, "_pack_qwertz");
    const dest = path.join(stage, "qwertz");
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    try {
      execSync(
        `robocopy "${qwertzRoot}" "${dest}" /MIR /XD node_modules dist uploads .git /XF .env .env.* *.log /NFL /NDL /NJH /NJS /nc /ns /np`,
        { stdio: "inherit", windowsHide: true }
      );
    } catch (e) {
      const code = e.status ?? e.code;
      if (typeof code === "number" && code >= 8) throw e;
    }
    execSync(`tar -czf "${out}" -C "${stage}" qwertz`, { stdio: "inherit" });
    fs.rmSync(stage, { recursive: true, force: true });
  } else {
    execSync(
      `tar -czf "${out}" --exclude=node_modules --exclude=dist --exclude=uploads --exclude=.git --exclude=.env --exclude=.env.* -C "${path.dirname(qwertzRoot)}" "${path.basename(qwertzRoot)}"`,
      { stdio: "inherit" }
    );
  }

  const mb = (fs.statSync(out).size / (1024 * 1024)).toFixed(2);
  console.log(`Wrote ${out} (${mb} MB)`);
  return out;
}

function envFileText(map) {
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")
    .concat("\n");
}

async function syncMorongwaEnv(conn, cfg, updates) {
  const remoteBackendRoot = resolveRemoteBackendRoot(cfg).replace(/\/$/, "");
  const remoteEnv = `${remoteBackendRoot}/.env`;
  const apiContainer = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim() || "morongwa-api-test";

  const existing = await new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.readFile(remoteEnv, (e, buf) => {
        if (e) {
          if (e.code === 2 || e.code === "ENOENT") return resolve("");
          return reject(e);
        }
        resolve(buf.toString("utf8"));
      });
    });
  });

  const merged = upsertEnvLines(existing, updates);
  await sftpWriteFile(conn, remoteEnv, merged);
  console.log(`==> Wrote ${remoteEnv} (QWERTZ_API_URL, QWERTZ_API_KEY)`);
  await execSsh(conn, `docker restart ${shSingleQuote(apiContainer)}`);
  console.log(`==> Restarted ${apiContainer}`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const noEnvSync = process.argv.includes("--no-env-sync");

  const cfg = mergeDeployConfig(repoRoot);
  const qwertzRoot = resolveLocalQwertzRoot(repoRoot);
  const remoteQwertzRoot = resolveRemoteQwertzRoot(cfg);
  const remoteParent = path.dirname(remoteQwertzRoot).replace(/\\/g, "/");
  const containerName = (cfg.QWERTZ_DOCKER_NAME || "qwertz-api").trim() || "qwertz-api";
  const dockerNetwork = (cfg.QWERTZ_DOCKER_NETWORK || "shared-network").trim() || "shared-network";
  const hostPort = (cfg.QWERTZ_PORT || "4100").trim() || "4100";
  const staging = (cfg.MORONGWA_STAGING_PARENT || "/root").replace(/\/$/, "");
  const remoteTgz = `${staging}/qwertz-deploy.tgz`;

  const localEnvPath = path.join(backendRoot, ".env");
  const localKv = fs.existsSync(localEnvPath) ? loadKv(localEnvPath) : {};
  const morongwaUpdates = buildQwertzEnvUpdates(localKv, cfg);
  const serviceEnv = buildQwertzServiceEnv(morongwaUpdates, cfg);

  console.log("==> Local Qwertz root:", qwertzRoot);
  console.log("==> Remote Qwertz root:", remoteQwertzRoot);
  console.log("==> Docker:", containerName, "on", dockerNetwork, `port ${hostPort}`);
  console.log("==> Morongwa proxy target:", morongwaUpdates.QWERTZ_API_URL);

  if (!dryRun) {
    upsertLocalEnvFile(localEnvPath, morongwaUpdates);
    const qwertzEnvPath = path.join(qwertzRoot, ".env");
    upsertLocalEnvFile(qwertzEnvPath, serviceEnv);
    console.log("==> Updated local env:", localEnvPath, "and", qwertzEnvPath);
  }

  if (dryRun) {
    console.log("(dry-run) would upload tarball, docker build/run, sync morongwa env");
    return;
  }

  console.log("==> Building Qwertz tarball...");
  const tarball = buildQwertzTarball(qwertzRoot);

  const conn = await sshConnect(cfg, repoRoot);
  console.log(`==> SFTP -> ${remoteTgz}`);
  await sftpPut(conn, tarball, remoteTgz);

  const remoteScript = `
set -e
mkdir -p ${shSingleQuote(remoteParent)}
cd ${shSingleQuote(remoteParent)}
rm -rf qwertz
tar -xzf ${shSingleQuote(remoteTgz)}
cd ${shSingleQuote(remoteQwertzRoot)}
cat > .env << 'QWERTZ_ENV_EOF'
${envFileText(serviceEnv)}QWERTZ_ENV_EOF
echo "==> Ensuring FFmpeg in build (Dockerfile) and shared-network exists"
docker network inspect ${shSingleQuote(dockerNetwork)} >/dev/null 2>&1 || docker network create ${shSingleQuote(dockerNetwork)}
echo "==> docker build qwertz-api"
docker build -t qwertz-api:latest .
docker rm -f ${shSingleQuote(containerName)} 2>/dev/null || true
docker run -d \\
  --name ${containerName} \\
  --network ${dockerNetwork} \\
  --restart unless-stopped \\
  -p 127.0.0.1:${hostPort}:${hostPort} \\
  --env-file .env \\
  -v qwertz-uploads:/app/uploads \\
  qwertz-api:latest
echo "==> Waiting for Qwertz health..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sfS http://127.0.0.1:${hostPort}/health >/dev/null 2>&1; then
    echo "Qwertz /health OK on host :${hostPort}"
    break
  fi
  sleep 2
done
curl -sfS http://127.0.0.1:${hostPort}/api/v1/health || echo "WARN: /api/v1/health probe failed"
docker ps --filter name=${containerName} --format '{{.Names}} {{.Status}}'
`.trim();

  console.log("==> Remote extract + docker build + run...");
  await execSsh(conn, remoteScript);

  if (!noEnvSync) {
    console.log("==> Sync QWERTZ_* into morongwa backend .env...");
    await syncMorongwaEnv(conn, cfg, morongwaUpdates);
  }

  conn.end();
  fs.rmSync(tarball, { force: true });
  console.log("==> Qwertz deploy done.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
