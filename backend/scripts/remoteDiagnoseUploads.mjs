/**
 * Check where TV/music uploads live on the production host vs API container.
 * Run: cd backend && node scripts/remoteDiagnoseUploads.mjs
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
      stream.stderr.on("data", (d) => {
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
echo "=== API container mounts ==="
docker inspect ${api} --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}' 2>/dev/null || echo "inspect failed"
echo "=== host upload counts ==="
for d in /home/zweppe/morongwa-live/backend/uploads/tv /var/www/morongwa/backend/uploads/tv; do
  if [ -d "$d" ]; then echo -n "$d: "; find "$d" -maxdepth 1 -type f | wc -l; fi
done
echo "=== container /app/uploads/tv file count ==="
docker exec ${api} sh -lc 'test -d /app/uploads/tv && find /app/uploads/tv -maxdepth 1 -type f | wc -l || echo 0'
echo "=== first 3 tv files on disk ==="
docker exec ${api} sh -lc 'ls -1 /app/uploads/tv 2>/dev/null | sed -n "1,3p"'
echo "=== test one real file via public URLs ==="
SAMPLE=$(docker exec ${api} sh -lc 'ls -1 /app/uploads/tv 2>/dev/null | sed -n "1p"')
echo "sample=$SAMPLE"
if [ -n "$SAMPLE" ]; then
  curl -s -o /dev/null -w "api:%{http_code}\\n" "https://api.qwertymates.com/uploads/tv/$SAMPLE"
  curl -s -o /dev/null -w "www:%{http_code}\\n" "https://www.qwertymates.com/uploads/tv/$SAMPLE"
fi
echo "=== API health ==="
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5001/health 2>/dev/null || echo "n/a"
`.trim();
  console.log(await execSsh(conn, cmd));
  conn.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
