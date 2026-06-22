import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const conn = await sshConnect(cfg, repoRoot);
  const cmd = [
    "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | head -15",
    "docker logs morongwa-api-test --tail 80 2>&1 || echo 'no api logs'",
    "docker exec morongwa-api-test sh -lc 'ss -lntp 2>/dev/null | grep 4000 || netstat -lntp 2>/dev/null | grep 4000 || echo no_listen_4000'",
    "curl -s -o /dev/null -w 'upstream4010:%{http_code}\\n' http://127.0.0.1:4010/api/health || echo upstream4010:fail",
    "curl -s -o /dev/null -w 'upstream3010:%{http_code}\\n' http://127.0.0.1:3010/ || echo upstream3010:fail",
  ].join("\n");
  await execSsh(conn, cmd);
  conn.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
