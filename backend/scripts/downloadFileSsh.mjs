/**
 * Resumable SFTP download (ssh2). Use for large backups when connections drop.
 *
 * Usage:
 *   node downloadFileSsh.mjs <host> <user> <password> <remotePath> <localPath> [port]
 *
 * Resume: if <localPath> exists and is smaller than the remote file, append from offset.
 * If local is larger than remote, local file is truncated and download restarts.
 *
 * Env (optional):
 *   SSH_PORT — default 22 or pass as 6th arg
 *   SFTP_RETRIES — connection retries (default 5)
 *   SFTP_RETRY_MS — delay between retries (default 4000)
 */
import { Client } from "ssh2";
import fs from "fs";
import path from "path";

const retries = Math.max(1, parseInt(process.env.SFTP_RETRIES || "5", 10));
const retryMs = Math.max(500, parseInt(process.env.SFTP_RETRY_MS || "4000", 10));

const args = process.argv.slice(2);
let host, username, password, remotePath, localPath, port = 22;

if (args.length >= 5) {
  [host, username, password, remotePath, localPath] = args;
  if (args[5]) port = parseInt(args[5], 10) || 22;
} else {
  console.error(
    "Usage: node downloadFileSsh.mjs <host> <user> <password> <remotePath> <localPath> [port]"
  );
  process.exit(1);
}

if (process.env.SSH_PORT) port = parseInt(process.env.SSH_PORT, 10) || port;

const localDir = path.dirname(localPath);
fs.mkdirSync(localDir, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function connectAndSftp() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on("ready", () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }
          resolve({ conn, sftp });
        });
      })
      .on("error", reject)
      .connect({
        host,
        username,
        password,
        port,
        readyTimeout: 30000,
      });
  });
}

function downloadOnce({ conn, sftp }) {
  return new Promise((resolve, reject) => {
    sftp.stat(remotePath, (statErr, remoteAttr) => {
      if (statErr) {
        conn.end();
        reject(statErr);
        return;
      }
      const remoteSize = remoteAttr.size;
      let start = 0;
      if (fs.existsSync(localPath)) {
        const st = fs.statSync(localPath);
        if (st.size === remoteSize) {
          console.log("already complete", localPath, remoteSize);
          conn.end();
          resolve({ skipped: true });
          return;
        }
        if (st.size > remoteSize) {
          fs.unlinkSync(localPath);
          start = 0;
        } else {
          start = st.size;
          console.log("resume from byte", start, "/", remoteSize);
        }
      }

      const readStream = sftp.createReadStream(remotePath, { start });
      const writeStream = fs.createWriteStream(localPath, { flags: start > 0 ? "a" : "w" });

      readStream.on("error", (e) => {
        writeStream.destroy();
        conn.end();
        reject(e);
      });
      writeStream.on("error", (e) => {
        readStream.destroy();
        conn.end();
        reject(e);
      });

      writeStream.on("finish", () => {
        conn.end();
        resolve({ skipped: false });
      });

      readStream.pipe(writeStream);
    });
  });
}

async function main() {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const session = await connectAndSftp();
      await downloadOnce(session);
      console.log("downloaded", localPath);
      return;
    } catch (e) {
      lastErr = e;
      console.error(`attempt ${attempt}/${retries} failed:`, e.message || e);
      if (attempt < retries) await sleep(retryMs);
    }
  }
  console.error("give up:", lastErr?.message || lastErr);
  process.exit(1);
}

main();
