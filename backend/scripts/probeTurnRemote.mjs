import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

const cmd = `
echo "=== coturn ==="
systemctl is-active coturn 2>/dev/null || echo inactive
ss -lun 2>/dev/null | grep -E '3478|5349' || true
echo "=== api TURN env (redacted) ==="
grep -E '^TURN_' /home/zweppe/morongwa-live/backend/.env 2>/dev/null | sed 's/=.*$/=***/' || echo no-turn-in-file
echo "=== turnserver.conf auth lines ==="
grep -E '^(use-auth-secret|static-auth-secret|realm|listening-port)' /etc/turnserver.conf 2>/dev/null | sed 's/static-auth-secret=.*/static-auth-secret=***/' || echo no-conf
`;

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const conn = await sshConnect(cfg, repoRoot);
  await execSsh(conn, cmd);
  conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
