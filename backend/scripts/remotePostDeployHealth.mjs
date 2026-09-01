/**
 * After deploy: verify NPM 7.conf (incl. listen 443), nginx -t, upstream 3010, HTTPS probe.
 *
 * Note: `curl https://www.qwertymates.com` *from the droplet* often fails with
 * `SSL UNRECOGNIZED NAME` (hairpin / public-IP routing). That is not the same as
 * off-droplet browsers. Use `node scripts/remoteNpmPatch7SslListen.mjs` if 7.conf
 * lacks `listen 443` after an NPM regen.
 *
 * Run: cd backend && node scripts/remotePostDeployHealth.mjs
 */
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function execSsh(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = "";
    conn.exec(cmd, (e, stream) => {
      if (e) return reject(e);
      stream.on("data", (d) => {
        out += String(d);
      });
      stream.stderr.on("data", (d) => {
        out += String(d);
      });
      stream.on("close", () => resolve(out));
    });
  });
}

async function main() {
  // Shared loader: deploy-server.config + secrets, backend/.env DEPLOY_SECRET, and private-key auth.
  const cfg = mergeDeployConfig(repoRoot);
  const conn = await sshConnect(cfg, repoRoot);
  const cmd = [
    'echo "=== docker ps (app + npm) ==="',
    "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'morongwa-web|morongwa-api|nginx-app-1|NAMES' || docker ps --format 'table {{.Names}}\t{{.Status}}' | head -12",
    'echo "=== NPM 7.conf (443 required) ==="',
    "docker exec nginx-app-1 sh -lc 'test -f /data/nginx/proxy_host/7.conf && (grep -n \"listen 443\" /data/nginx/proxy_host/7.conf || echo WARN_NO_LISTEN_443) && wc -l /data/nginx/proxy_host/7.conf || echo MISSING_7_CONF'",
    'echo "=== NPM custom server_proxy (no duplicate hls) ==="',
    "docker exec nginx-app-1 sh -lc 'cat /data/nginx/custom/server_proxy.conf 2>/dev/null | head -15'",
    'echo "=== nginx -t ==="',
    "docker exec nginx-app-1 nginx -t 2>&1",
    'echo "=== curl upstream http://127.0.0.1:3010/wall ==="',
    "curl -sI --max-time 15 http://127.0.0.1:3010/wall | head -8",
    'echo "=== TLS SNI www (inside NPM container, not hairpin) ==="',
    "docker exec nginx-app-1 sh -lc 'echo | openssl s_client -connect 127.0.0.1:443 -servername www.qwertymates.com 2>/dev/null | openssl x509 -noout -subject 2>/dev/null || true'",
  ].join("; ");
  const out = await execSsh(conn, `bash -lc ${JSON.stringify(cmd)}`);
  conn.end();
  console.log(out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
