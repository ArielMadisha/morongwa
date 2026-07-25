/**
 * Quick SSH probe: media server containers, ports, HLS health.
 * Run from backend/: node scripts/probeLivestreamRemote.mjs
 */
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const conn = await sshConnect(cfg, repoRoot);
  console.log("==> docker ps (media/rtmp related):");
  await execSsh(
    conn,
    "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null | head -30"
  );
  console.log("\n==> HLS health (127.0.0.1:8081):");
  await execSsh(
    conn,
    "curl -sS -o /dev/null -w 'HTTP %{http_code}\\n' http://127.0.0.1:8081/health 2>&1 || echo 'curl failed'"
  );
  console.log("\n==> Listening ports 1935 / 8081:");
  await execSsh(
    conn,
    "ss -tlnp 2>/dev/null | grep -E ':1935|:8081' || true"
  );
  console.log("\n==> nginx-rtmp / hls probe:");
  await execSsh(
    conn,
    "curl -sS -o /dev/null -w 'GET /hls/ HTTP %{http_code}\\n' http://127.0.0.1:8081/hls/ 2>&1 || true"
  );
  await execSsh(
    conn,
    "ls -la /tmp/hls 2>/dev/null | head -5 || ls -la /var/www/hls 2>/dev/null | head -5 || echo 'no hls dir found'"
  );
  await execSsh(
    conn,
    "docker ps -a --format '{{.Names}} {{.Status}}' | grep -i media || echo 'no media docker container'"
  );
  await execSsh(
    conn,
    "grep -E '^(TV_CHANNEL_FFMPEG|LIVESTREAM|RTMP|HLS)' /home/zweppe/morongwa-live/backend/.env 2>/dev/null | sed 's/\\(PASS\\|SECRET\\|URL=rtmp.*\\)/\\1=***/' || true"
  );
  console.log("\n==> Public HLS edge:");
  await execSsh(
    conn,
    "curl -sS -o /dev/null -w 'https://www.qwertymates.com/hls/ -> HTTP %{http_code}\\n' -I https://www.qwertymates.com/hls/ 2>&1 || true"
  );
  conn.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
