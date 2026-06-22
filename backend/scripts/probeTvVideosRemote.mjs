/**
 * List video files in production uploads/tv and sample filenames.
 */
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
      stream.stderr.on("data", (d) => process.stderr.write(String(d)));
      stream.on("close", () => resolve(out));
    });
  });
}

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const api = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim();
  const conn = await sshConnect(cfg, repoRoot);
  const out = await execSsh(
    conn,
    `docker exec ${api} bash -lc 'echo video_count=$(find /app/uploads/tv -maxdepth 1 -type f \\( -iname "*.mp4" -o -iname "*.webm" -o -iname "*.mov" \\) | wc -l); ls -lt /app/uploads/tv/*.mp4 2>/dev/null | head -15; echo school_gallery=$(find /app/uploads/school-gallery -type f 2>/dev/null | wc -l)'`
  );
  console.log(out);
  conn.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
