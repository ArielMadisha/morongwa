/**
 * Merge order-alert + platform-ops email settings into remote backend/.env and restart API.
 *
 * Reads from local backend/.env (gitignored):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *   ORDERS_INBOX_EMAIL, ORDERS_INBOX_CC (optional)
 *   PLATFORM_OPS_EMAIL
 *
 * Run from backend/: npm run sync:orders-ops-email-remote
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh, buildRemoteEnvPatchScript } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");

function loadKv(absPath) {
  const o = {};
  if (!fs.existsSync(absPath)) return o;
  let text = fs.readFileSync(absPath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
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

function resolveRemoteBackendRoot(cfg) {
  const explicit = (cfg.MORONGWA_BACKEND_HOST_PATH || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const live = (cfg.MORONGWA_LIVE_DIR || "").trim().replace(/\/$/, "");
  if (live) return `${live}/backend`;
  const deployPath = (cfg.DEPLOY_REMOTE_PATH || "").trim().replace(/\/$/, "");
  if (deployPath) return `${deployPath}/backend`;
  return "/home/zweppe/morongwa-live/backend";
}

function redactKey(k, v) {
  if (/SECRET|PASSWORD|PASS|TOKEN|KEY|URI|MONGO|AUTH/i.test(k)) return `${k}=***`;
  return `${k}=${v}`;
}

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const localEnvPath = path.join(backendRoot, ".env");
  if (!fs.existsSync(localEnvPath)) {
    throw new Error(`Missing ${localEnvPath}`);
  }
  const local = loadKv(localEnvPath);

  const smtpHost = (local.SMTP_HOST || process.env.SMTP_HOST || "mail.qwertymates.com").trim();
  const smtpPort = (local.SMTP_PORT || process.env.SMTP_PORT || "587").trim();
  const smtpUser = (local.SMTP_USER || process.env.SMTP_USER || "orders@qwertymates.com").trim();
  const smtpPass = (local.SMTP_PASS || process.env.SMTP_PASS || "").trim();
  const platformOpsEmail = (
    local.PLATFORM_OPS_EMAIL ||
    process.env.PLATFORM_OPS_EMAIL ||
    "administrator@qwertymates.com"
  ).trim();
  const ordersInboxCc = (local.ORDERS_INBOX_CC || process.env.ORDERS_INBOX_CC || "orders@qwertymates.com").trim();
  const disputesInbox = (
    local.DISPUTES_INBOX_EMAIL || process.env.DISPUTES_INBOX_EMAIL || "disputes@qwertymates.com"
  ).trim();
  const hrInbox = (local.HR_INBOX_EMAIL || process.env.HR_INBOX_EMAIL || "hr@qwertymates.com").trim();
  const ordersBw = (
    local.ORDERS_INBOX_BOTSWANA || process.env.ORDERS_INBOX_BOTSWANA || "botswana@qwertymates.com"
  ).trim();
  const ordersZm = (
    local.ORDERS_INBOX_ZAMBIA || process.env.ORDERS_INBOX_ZAMBIA || "zambia@qwertymates.com"
  ).trim();
  // Always keep +27660442139; merge any extra numbers from local/env.
  const requiredOpsWa = "+27660442139";
  const extraOpsWa = (local.ORDERS_OPS_WHATSAPP || process.env.ORDERS_OPS_WHATSAPP || "").trim();
  const ordersOpsWhatsapp = [
    ...new Set(
      [requiredOpsWa, ...extraOpsWa.split(/[,;]+/)]
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ].join(",");

  if (!smtpPass || smtpPass.includes("your-app-password") || smtpPass.includes("your-email")) {
    throw new Error(
      "Set SMTP_PASS (and SMTP_USER) in backend/.env to the Qwertymates mailbox used for sending before sync."
    );
  }

  const updates = {
    SMTP_HOST: smtpHost,
    SMTP_PORT: smtpPort,
    SMTP_USER: smtpUser,
    SMTP_PASS: smtpPass,
    PLATFORM_OPS_EMAIL: platformOpsEmail,
    ORDERS_INBOX_CC: ordersInboxCc,
    DISPUTES_INBOX_EMAIL: disputesInbox,
    HR_INBOX_EMAIL: hrInbox,
    ORDERS_INBOX_BOTSWANA: ordersBw,
    ORDERS_INBOX_ZAMBIA: ordersZm,
    ORDERS_OPS_WHATSAPP: ordersOpsWhatsapp,
  };

  const ordersInbox = (local.ORDERS_INBOX_EMAIL || "").trim();
  if (ordersInbox) updates.ORDERS_INBOX_EMAIL = ordersInbox;

  console.log("==> Values to sync (secrets redacted):");
  for (const [k, v] of Object.entries(updates)) {
    console.log("    ", redactKey(k, v));
  }

  const remoteBackendRoot = resolveRemoteBackendRoot(cfg).replace(/\/$/, "");
  const remoteEnv = `${remoteBackendRoot}/.env`;
  const apiContainer = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim() || "morongwa-api-test";

  const conn = await sshConnect(cfg, repoRoot);
  await execSsh(conn, buildRemoteEnvPatchScript(remoteEnv, updates));
  console.log("==> Wrote merged .env on server.");

  await execSsh(conn, `docker restart ${apiContainer}`);
  conn.end();
  console.log(`==> Restarted ${apiContainer}. Order + ops email routing is active after container start.`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
