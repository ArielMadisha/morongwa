/** One-shot: Qwertz deploy probe (network, ffmpeg, existing install). */
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const cmd = `bash -s <<'EOS'
set +e
echo "=== api network ==="
docker inspect morongwa-api-test --format '{{.HostConfig.NetworkMode}}' 2>/dev/null
echo "=== api ports ==="
docker port morongwa-api-test 2>/dev/null
echo "=== host ffmpeg ==="
command -v ffmpeg && ffmpeg -version 2>&1 | head -1
echo "=== docker ps qwertz ==="
docker ps -a --filter name=qwertz --format '{{.Names}} {{.Status}} {{.Ports}}'
echo "=== qwertz dir ==="
ls -la /home/zweppe/qwertz 2>&1 | head -8
ls -la /opt/qwertz 2>&1 | head -5
echo "=== curl 4100 ==="
curl -sfS http://127.0.0.1:4100/health 2>&1 || echo "4100 not reachable"
echo "=== remote backend env qwertz ==="
grep -E '^QWERTZ_' /home/zweppe/morongwa-live/backend/.env 2>/dev/null | sed 's/=.*/=***/'
echo "=== shared-network ==="
docker network inspect shared-network --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null
EOS`;

const cfg = mergeDeployConfig(repoRoot);
const conn = await sshConnect(cfg, repoRoot);
await execSsh(conn, cmd);
conn.end();
