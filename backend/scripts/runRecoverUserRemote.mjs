#!/usr/bin/env node
/** Run recoverUserAccount.mjs inside production API container (uses container /app/.env). */
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

function execSsh(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      stream.on("data", (d) => {
        const s = String(d);
        out += s;
        process.stdout.write(s);
      });
      stream.stderr.on("data", (d) => process.stderr.write(String(d)));
      stream.on("close", (code) => {
        if (code === 0) resolve(out);
        else reject(new Error(`Remote exit ${code}`));
      });
    });
  });
}

async function main() {
  const search = process.argv[2] || "ariel";
  const apply = process.argv.includes("--apply");
  const cfg = mergeDeployConfig(repoRoot);
  if (process.env.DEPLOY_SSH_PASSWORD?.trim()) {
    cfg.DEPLOY_SSH_PASSWORD = process.env.DEPLOY_SSH_PASSWORD.trim();
  }
  const apiContainer = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim();
  const secretsPath = path.join(repoRoot, "deploy-server.secrets");
  const conn = await sshConnect(cfg, repoRoot, { secretsPath });

  const remoteScript = apply
    ? `docker exec ${apiContainer} bash -lc 'cd /app && RESET_PASSWORD="${(process.env.RESET_PASSWORD || "").replace(/"/g, '\\"')}" node scripts/recoverUserAccount.mjs ${search} --apply'`
    : `docker exec ${apiContainer} bash -lc 'cd /app && node scripts/recoverUserAccount.mjs ${search}'`;

  await execSsh(conn, remoteScript);
  conn.end();
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
