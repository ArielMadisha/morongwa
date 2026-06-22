/** One-shot: ensure production backend/.env has a strong OTP_SECRET before security hardening deploy. */
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cfg = mergeDeployConfig(repoRoot);
const live = (cfg.MORONGWA_LIVE_DIR || "/home/zweppe/morongwa-live").replace(/\/$/, "");
const envFile = `${live}/backend/.env`;
const apiContainer = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim() || "morongwa-api-test";
const newSecret = crypto.randomBytes(32).toString("hex");

const conn = await sshConnect(cfg, repoRoot);
await execSsh(
  conn,
  `if grep -qE '^OTP_SECRET=.{24,}' "${envFile}" 2>/dev/null; then echo OTP_SECRET_ALREADY_OK; else if grep -q '^OTP_SECRET=' "${envFile}" 2>/dev/null; then sed -i "s/^OTP_SECRET=.*/OTP_SECRET=${newSecret}/" "${envFile}"; echo UPDATED_OTP_SECRET; else echo "OTP_SECRET=${newSecret}" >> "${envFile}"; echo APPENDED_OTP_SECRET; fi; fi`
);
await execSsh(conn, `docker restart ${apiContainer}`);
conn.end();
console.log("Done. OTP_SECRET ensured on remote (value not printed).");
