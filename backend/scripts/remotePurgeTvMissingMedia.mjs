/**
 * Run purgeTvPostsMissingMedia inside the production API container (checks server uploads/tv).
 * backend/: npm run purge:tv-missing-media:remote
 */
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const dry = process.argv.includes("--dry-run");

function execSsh(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => process.stdout.write(String(d)));
      stream.stderr.on("data", (d) => process.stderr.write(String(d)));
      stream.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Remote exit ${code}`));
      });
    });
  });
}

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const apiContainer = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim() || "morongwa-api-test";
  const flag = dry ? " -- --dry-run" : "";
  const conn = await sshConnect(cfg, repoRoot, {
    secretsPath: path.join(repoRoot, "deploy-server.secrets"),
  });
  console.log(`==> ${dry ? "Dry-run" : "Purge"} TV posts missing media in ${apiContainer}...`);
  await execSsh(
    conn,
    `docker exec ${apiContainer} bash -lc 'cd /app && npm run purge:tv-missing-media${flag}'`
  );
  conn.end();
  console.log("==> Done.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
