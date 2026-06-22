/**
 * One-off: verify NPM api vhost upload limits + recent API logs.
 * Run: cd backend && node scripts/probeTvUploadRemote.mjs
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
      stream.on("close", (code) => resolve({ code, stdout: out }));
    });
  });
}

const cmd = [
  "docker exec nginx-app-1 sh -lc 'grep -n QM_API_UPLOAD /data/nginx/proxy_host/2.conf; grep -n client_max_body /data/nginx/proxy_host/2.conf | head -5'",
  "docker logs morongwa-api-test --tail 60 2>&1 | tail -40",
].join(" && ");

const cfg = mergeDeployConfig(repoRoot);
const conn = await sshConnect(cfg, repoRoot);
const r = await execSsh(conn, cmd);
console.log(r.stdout);
conn.end();
process.exit(r.code || 0);
