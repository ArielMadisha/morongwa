/**
 * SFTP angelamerkel-* profile images to production.
 *   node scripts/pushAngelaMerkelUploadsRemote.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (e) => (e ? reject(e) : resolve()));
    });
  });
}

function resolveRemoteBackendRoot(cfg) {
  const explicit = (cfg.MORONGWA_BACKEND_HOST_PATH || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const live = (cfg.MORONGWA_LIVE_DIR || "").trim().replace(/\/$/, "");
  if (live) return `${live}/backend`;
  return "/home/zweppe/morongwa-live/backend";
}

async function main() {
  const profilesDir = path.join(__dirname, "..", "uploads", "profiles");
  const files = fs.existsSync(profilesDir)
    ? fs
        .readdirSync(profilesDir)
        .filter((f) => f.startsWith("angelamerkel-") && /\.(jpe?g|png|webp)$/i.test(f))
    : [];
  if (!files.length) {
    console.log("No angelamerkel-* images — run setupAngelaMerkelAccount.ts first.");
    process.exit(0);
  }

  const cfg = mergeDeployConfig(repoRoot);
  const remoteDir = `${resolveRemoteBackendRoot(cfg)}/uploads/profiles`;
  console.log(`==> Upload ${files.length} file(s) -> ${remoteDir}/`);
  const conn = await sshConnect(cfg, repoRoot);
  try {
    await execSsh(conn, `mkdir -p "${remoteDir}"`);
    for (const name of files) {
      await sftpPut(conn, path.join(profilesDir, name), `${remoteDir}/${name}`);
      console.log(`    ${name}`);
    }
    console.log("==> Angela Merkel profile uploads sync done.");
  } finally {
    conn.end();
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
