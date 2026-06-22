import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function execSsh(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = "";
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => {
        out += String(d);
      });
      stream.on("close", () => resolve(out));
    });
  });
}

const cfg = mergeDeployConfig(repoRoot);
const api = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim();
const conn = await sshConnect(cfg, repoRoot);
const total = await execSsh(conn, `docker logs ${api} 2>&1 | grep -c "TV media uploaded" || true`);
const ariel = await execSsh(
  conn,
  `docker logs ${api} 2>&1 | grep "TV media uploaded" | grep "69d4bd1642ec816dcc09e708" || true`
);
console.log("total_log_lines", total.trim());
console.log("arielmadisha_uploads:\n", ariel);
conn.end();
