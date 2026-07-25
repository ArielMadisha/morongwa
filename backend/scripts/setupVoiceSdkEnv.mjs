/**
 * Provision Twilio Voice SDK (TwiML app + API key) and sync env to remote production API.
 * Run from backend/: node scripts/setupVoiceSdkEnv.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import twilio from "twilio";
import { mergeDeployConfig, sshConnect, execSsh, loadKv } from "./lib/deploySsh.mjs";
import { upsertEnvLines, resolveRemoteBackendRoot } from "./lib/livestreamRemoteEnv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");
const localEnvPath = path.join(backendRoot, ".env");

const VOICE_ENV_KEYS = [
  "VOICE_ENABLED",
  "TWILIO_VOICE_FROM",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_VOICE_APPLICATION_SID",
];

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

function upsertLocalEnv(updates) {
  const existing = fs.existsSync(localEnvPath) ? fs.readFileSync(localEnvPath, "utf8") : "";
  const merged = upsertEnvLines(existing, updates);
  fs.writeFileSync(localEnvPath, merged, "utf8");
}

async function ensureTwilioVoiceApp(client, apiBase, existingSid) {
  const voiceUrl = `${apiBase}/api/voice/twiml/client-outbound`;
  const statusUrl = `${apiBase}/api/voice/webhook/status`;
  if (existingSid) {
    const app = await client.applications(existingSid).update({
      friendlyName: "Qwertymates Morongwa Voice SDK",
      voiceUrl,
      voiceMethod: "POST",
      statusCallback: statusUrl,
      statusCallbackMethod: "POST",
    });
    console.log("Updated TwiML Application:", app.sid);
    return app.sid;
  }
  const app = await client.applications.create({
    friendlyName: "Qwertymates Morongwa Voice SDK",
    voiceUrl,
    voiceMethod: "POST",
    statusCallback: statusUrl,
    statusCallbackMethod: "POST",
  });
  console.log("Created TwiML Application:", app.sid);
  return app.sid;
}

async function main() {
  dotenv.config({ path: localEnvPath });
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const apiBase = String(
    process.env.BACKEND_URL || process.env.API_PUBLIC_URL || "https://api.qwertymates.com"
  ).replace(/\/$/, "");

  if (!accountSid || !authToken) {
    throw new Error("Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN in backend/.env");
  }
  if (apiBase.includes("localhost")) {
    throw new Error("Set BACKEND_URL=https://api.qwertymates.com (Twilio rejects localhost webhooks)");
  }

  const client = twilio(accountSid, authToken);
  const local = loadKv(localEnvPath);

  let appSid = String(local.TWILIO_VOICE_APPLICATION_SID || process.env.TWILIO_VOICE_APPLICATION_SID || "").trim();
  appSid = await ensureTwilioVoiceApp(client, apiBase, appSid || undefined);

  let apiKeySid = String(local.TWILIO_API_KEY_SID || process.env.TWILIO_API_KEY_SID || "").trim();
  let apiKeySecret = String(local.TWILIO_API_KEY_SECRET || process.env.TWILIO_API_KEY_SECRET || "").trim();

  if (!apiKeySid || !apiKeySecret) {
    const key = await client.newKeys.create({ friendlyName: "Qwertymates Morongwa Voice SDK" });
    apiKeySid = key.sid;
    apiKeySecret = key.secret;
    console.log("Created Twilio API Key:", apiKeySid);
  }

  const voiceFrom = String(
    local.TWILIO_VOICE_FROM || process.env.TWILIO_VOICE_FROM || local.TWILIO_SMS_FROM || process.env.TWILIO_SMS_FROM || ""
  ).trim();
  if (!voiceFrom) {
    throw new Error("Set TWILIO_VOICE_FROM or TWILIO_SMS_FROM in backend/.env");
  }

  const updates = {
    VOICE_ENABLED: "1",
    TWILIO_VOICE_FROM: voiceFrom,
    TWILIO_API_KEY_SID: apiKeySid,
    TWILIO_API_KEY_SECRET: apiKeySecret,
    TWILIO_VOICE_APPLICATION_SID: appSid,
  };

  upsertLocalEnv(updates);
  console.log("==> Updated local backend/.env (voice SDK keys)");

  const cfg = mergeDeployConfig(repoRoot);
  const remoteBackendRoot = resolveRemoteBackendRoot(cfg).replace(/\/$/, "");
  const remoteEnv = `${remoteBackendRoot}/.env`;
  const apiContainer = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim() || "morongwa-api-test";

  const conn = await sshConnect(cfg, repoRoot);
  let existingRemote = null;
  try {
    existingRemote = await sftpReadFile(conn, remoteEnv);
  } catch (e) {
    console.warn("Could not read remote .env:", e?.message || e);
  }
  await sftpWriteFile(conn, remoteEnv, upsertEnvLines(existingRemote || "", updates));
  console.log(`==> Wrote ${remoteEnv}`);

  await execSsh(conn, `docker restart ${apiContainer}`);
  conn.end();
  console.log(`==> Restarted ${apiContainer}`);
  console.log("==> Voice SDK should be enabled at GET /api/voice/status");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
