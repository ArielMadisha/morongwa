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
const out = await execSsh(
  conn,
  `docker logs ${api} 2>&1 | grep -F "TV media uploaded" | tail -20`
);
console.log(out || "(no log lines)");
conn.end();
