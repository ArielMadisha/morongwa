#!/usr/bin/env node
/** Grep Twilio WA env keys on production (values masked). */
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cfg = mergeDeployConfig(repoRoot);
const live = (cfg.MORONGWA_LIVE_DIR || "/home/zweppe/morongwa-live").replace(/\/$/, "");
const envFile = `${live}/backend/.env`;

const cmd = `
grep -E '^TWILIO_(WHATSAPP_FROM|WHATSAPP_FROM_BW|WA_|SUBACCOUNT|STUDIO_FLOW|ACCOUNT_SID)=' "${envFile}" 2>/dev/null | sed -E 's/=(.*)/=***MASKED***/' || echo "(no .env or no matches)"
`.trim();

const conn = await sshConnect(cfg, repoRoot);
console.log(await execSsh(conn, cmd));
conn.end();
