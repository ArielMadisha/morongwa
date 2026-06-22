/**
 * Align coturn static-auth-secret with backend TURN_SHARED_SECRET (ephemeral TURN creds).
 * Run from backend/: npm run fix:coturn-turn-auth
 */
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

function esc(v) {
  return String(v || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const backendEnv = await import("dotenv");
  backendEnv.config({ path: path.join(repoRoot, "backend", ".env"), override: false });

  const turnRealm = (process.env.TURN_REALM || cfg.TURN_REALM || "qwertymates.com").trim();
  const turnUser = (process.env.TURN_USERNAME || cfg.TURN_USERNAME || "").trim();
  const turnPass = (process.env.TURN_PASSWORD || cfg.TURN_PASSWORD || "").trim();
  const turnSharedSecret = (process.env.TURN_SHARED_SECRET || cfg.TURN_SHARED_SECRET || turnPass).trim();
  if (!turnSharedSecret) {
    throw new Error("Missing TURN_SHARED_SECRET or TURN_PASSWORD in backend/.env or deploy-server.secrets");
  }

  const remoteScript = `bash -lc '
set -euo pipefail
cp /etc/turnserver.conf /etc/turnserver.conf.bak.$(date +%s) 2>/dev/null || true
cat > /etc/turnserver.conf <<EOF
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
static-auth-secret=${esc(turnSharedSecret)}
realm=${esc(turnRealm)}
total-quota=100
bps-capacity=0
stale-nonce=600
no-loopback-peers
no-multicast-peers
min-port=10000
max-port=20000
lt-cred-mech
user=${esc(turnUser)}:${esc(turnPass)}
EOF
systemctl enable coturn
systemctl restart coturn
systemctl is-active coturn
echo coturn_ok
'`;

  const conn = await sshConnect(cfg, repoRoot);
  try {
    await execSsh(conn, remoteScript);
    console.log("\nCoturn updated — static-auth-secret matches TURN_SHARED_SECRET.");
  } finally {
    conn.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
