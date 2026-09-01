#!/usr/bin/env node
/**
 * Merge MOBILE_IOS_* env keys from local backend/.env (or defaults) into production .env.
 * Run from backend/:  npm run sync:mobile-ios-env-remote
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const localEnvPath = path.join(repoRoot, "backend", ".env");

const DEFAULT_IOS_STORE_URL = "https://apps.apple.com/app/id6798004708";
const SYNC_KEYS = ["MOBILE_IOS_STORE_URL", "MOBILE_IOS_FORCE_UPDATE"];

function loadLocalPatch() {
  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath, override: false });
  }
  const out = {};
  for (const k of SYNC_KEYS) {
    const v = String(process.env[k] || "").trim();
    if (v) out[k] = v;
  }
  if (!out.MOBILE_IOS_STORE_URL) out.MOBILE_IOS_STORE_URL = DEFAULT_IOS_STORE_URL;
  return out;
}

async function main() {
  const patch = loadLocalPatch();
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
grep -E '^MOBILE_IOS_(STORE_URL|FORCE_UPDATE)=' "${envFile}" | sed -E 's/=(.*)/=<set>/'
docker restart morongwa-api-test 2>/dev/null || true
`.trim();

  const conn = await sshConnect(cfg, repoRoot);
  console.log(`Syncing ${Object.keys(patch).join(", ")} to ${envFile}…`);
  await execSsh(conn, cmd);
  conn.end();
  console.log("Done. API container restarted.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
