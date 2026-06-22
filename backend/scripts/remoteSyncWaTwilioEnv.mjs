#!/usr/bin/env node
/**
 * Merge critical WhatsApp / Twilio env keys from local backend/.env into production live .env.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const localEnvPath = path.join(repoRoot, "backend", ".env");

const WA_SYNC_KEYS = [
  "TWILIO_WHATSAPP_FROM_BW",
  "TWILIO_WA_BW_ACCOUNT_SID",
  "TWILIO_WA_BW_AUTH_TOKEN",
  "TWILIO_WA_ACCOUNT_SID",
  "TWILIO_WA_AUTH_TOKEN",
  "TWILIO_SUBACCOUNT_SID",
  "TWILIO_SUBACCOUNT_AUTH_TOKEN",
  "TWILIO_STUDIO_FLOW_SID_BW",
  "TWILIO_WHATSAPP_RSA_USE_PARENT_CREDENTIALS",
];

function loadLocalPatch() {
  if (!fs.existsSync(localEnvPath)) return {};
  dotenv.config({ path: localEnvPath, override: false });
  const out = {};
  for (const k of WA_SYNC_KEYS) {
    const v = String(process.env[k] || "").trim();
    if (v) out[k] = v;
  }
  return out;
}

async function main() {
  const patch = loadLocalPatch();
  const keys = Object.keys(patch);
  if (!keys.length) {
    console.log("No WhatsApp/Twilio keys to sync from backend/.env");
    return;
  }

  const cfg = mergeDeployConfig(repoRoot);
  const live = (cfg.MORONGWA_LIVE_DIR || "/home/zweppe/morongwa-live").replace(/\/$/, "");
  const envFile = `${live}/backend/.env`;
  const b64 = Buffer.from(JSON.stringify(patch), "utf8").toString("base64");

  const cmd = `
set -e
touch "${envFile}"
python3 - <<'PY'
import json, base64, pathlib, re
env_path = pathlib.Path("${envFile}")
patch = json.loads(base64.b64decode("${b64}").decode("utf-8"))
lines = env_path.read_text(encoding="utf-8", errors="replace").splitlines() if env_path.exists() else []
out = []
seen = set()
for line in lines:
    m = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)=', line)
    if m and m.group(1) in patch:
        out.append(f"{m.group(1)}={patch[m.group(1)]}")
        seen.add(m.group(1))
    else:
        out.append(line)
for k, v in patch.items():
    if k not in seen:
        out.append(f"{k}={v}")
env_path.write_text("\\n".join(out) + ("\\n" if out else ""), encoding="utf-8")
print("Merged keys:", ", ".join(sorted(patch.keys())))
PY
grep -E '^TWILIO_(WHATSAPP_FROM|WHATSAPP_FROM_BW|SUBACCOUNT_SID|WA_ACCOUNT_SID|STUDIO_FLOW_SID|STUDIO_FLOW_SID_BW)=' "${envFile}" | sed -E 's/=(.*)/=***/'
docker restart morongwa-api-test 2>/dev/null || true
`.trim();

  const conn = await sshConnect(cfg, repoRoot);
  console.log(`Syncing ${keys.length} WhatsApp/Twilio key(s) to ${envFile}…`);
  await execSsh(conn, cmd);
  conn.end();
  console.log("Done. API container restarted.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
