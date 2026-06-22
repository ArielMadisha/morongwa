/**
 * Count school-gallery files on production + HTTP probe sample URLs.
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
      stream.on("close", () => resolve(out));
    });
  });
}

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const api = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim();
  const conn = await sshConnect(cfg, repoRoot);
  const cmd = `
echo "=== school-gallery file counts ==="
for d in /home/zweppe/morongwa-live/backend/uploads/school-gallery; do
  if [ -d "$d" ]; then echo -n "host $d: "; find "$d" -type f | wc -l; fi
done
docker exec ${api} sh -lc 'test -d /app/uploads/school-gallery && find /app/uploads/school-gallery -type f | wc -l || echo 0'
echo "=== sample file on disk ==="
SAMPLE=$(find /home/zweppe/morongwa-live/backend/uploads/school-gallery -type f 2>/dev/null | head -1)
echo "sample=$SAMPLE"
if [ -n "$SAMPLE" ]; then
  REL=$(echo "$SAMPLE" | sed 's|.*/uploads/|uploads/|')
  BASENAME=$(basename "$SAMPLE")
  DIRREL=$(dirname "$REL")
  curl -s -o /dev/null -w "www:%{http_code}\\n" "https://www.qwertymates.com/$REL"
  curl -s -o /dev/null -w "api:%{http_code}\\n" "https://api.qwertymates.com/$REL"
fi
`.trim();
  console.log(await execSsh(conn, cmd));
  conn.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
