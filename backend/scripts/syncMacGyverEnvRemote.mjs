/**
 * Sync MacGyver / OpenAI env keys from local backend/.env → remote backend/.env, then restart API.
 *
 *   node scripts/syncMacGyverEnvRemote.mjs
 *   node scripts/syncMacGyverEnvRemote.mjs --dry-run
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh, loadKv } from "./lib/deploySsh.mjs";
import { upsertEnvLines, resolveRemoteBackendRoot } from "./lib/livestreamRemoteEnv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");

const MACGYVER_KEYS = [
  "OPENAI_API_KEY",
  "MACGYVER_OPENAI_MODEL",
  "MACGYVER_OPENAI_TIMEOUT_MS",
  "TAVILY_API_KEY",
  "MACGYVER_WEB_SEARCH_DISABLED",
  "MACGYVER_LEARNED_MAX_AGE_MS",
];

const dryRun = process.argv.includes("--dry-run");

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

function mask(k, v) {
  if (!v) return "(empty)";
  if (/KEY|SECRET|TOKEN/i.test(k)) return `(set, ${v.length} chars)`;
  return v;
}

async function main() {
  const localEnvPath = path.join(backendRoot, ".env");
  if (!fs.existsSync(localEnvPath)) throw new Error(`Missing ${localEnvPath}`);
  const local = loadKv(localEnvPath);

  const updates = {};
  for (const k of MACGYVER_KEYS) {
    const v = String(local[k] || "").trim();
    if (v) updates[k] = v;
  }
  if (!updates.OPENAI_API_KEY) {
    throw new Error("Local backend/.env must define OPENAI_API_KEY for MacGyver LLM answers");
  }
  if (!updates.MACGYVER_OPENAI_MODEL) updates.MACGYVER_OPENAI_MODEL = "gpt-4o-mini";

  console.log("==> MacGyver keys to sync:");
  for (const [k, v] of Object.entries(updates)) {
    console.log(`  ${k}=${mask(k, v)}`);
  }

  const cfg = mergeDeployConfig(repoRoot);
  const remoteBackendRoot = resolveRemoteBackendRoot(cfg).replace(/\/$/, "");
  const remoteEnv = `${remoteBackendRoot}/.env`;
  const apiContainer = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim() || "morongwa-api-test";

  const conn = await sshConnect(cfg, repoRoot);
  try {
    const existing = await sftpReadFile(conn, remoteEnv);
    const remoteKv = {};
    for (const line of String(existing || "").split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) remoteKv[m[1]] = m[2];
    }
    console.log("==> Remote before:");
    for (const k of MACGYVER_KEYS) {
      console.log(`  ${k}=${mask(k, remoteKv[k] || "")}`);
    }

    if (dryRun) {
      console.log("Dry run — no write / restart.");
      return;
    }

    const merged = upsertEnvLines(existing || "", updates);
    await sftpWriteFile(conn, remoteEnv, merged);
    console.log(`==> Wrote ${remoteEnv}`);
    await execSsh(conn, `docker restart ${apiContainer}`);
    console.log(`==> Restarted ${apiContainer}`);
  } finally {
    conn.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
