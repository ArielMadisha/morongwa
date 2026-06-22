import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const BATCH = "1782037989";

function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (e) => (e ? reject(e) : resolve()));
    });
  });
}

async function main() {
  const profilesDir = path.join(__dirname, "..", "uploads", "profiles");
  const files = fs
    .readdirSync(profilesDir)
    .filter((f) => f.startsWith("aturetutu-") && f.includes(BATCH));
  if (!files.length) throw new Error("No latest batch files found");

  const cfg = mergeDeployConfig(repoRoot);
  const remoteDir = "/home/zweppe/morongwa-live/backend/uploads/profiles";
  console.log(`==> Upload ${files.length} latest file(s)`);
  const conn = await sshConnect(cfg, repoRoot);
  try {
    await execSsh(conn, `mkdir -p "${remoteDir}"`);
    for (const name of files) {
      await sftpPut(conn, path.join(profilesDir, name), `${remoteDir}/${name}`);
      console.log(`    ${name}`);
    }
  } finally {
    conn.end();
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
