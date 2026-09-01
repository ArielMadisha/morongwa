/** Smoke: morongwa-api → qwertz-api + public /api/qwertz/health */
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const cmd = `bash -s <<'EOS'
set +e
echo "=== api container status ==="
docker ps --filter name=morongwa-api-test --format '{{.Names}} {{.Status}}'
echo "=== qwertz container ==="
docker ps --filter name=qwertz-api --format '{{.Names}} {{.Status}}'
echo "=== from api container to qwertz ==="
docker exec morongwa-api-test bash -lc 'curl -sfS http://qwertz-api:4100/api/v1/health 2>&1 || echo FAIL'
echo ""
echo "=== api local health ==="
curl -sfS http://127.0.0.1:4010/api/health 2>&1 | head -c 200
echo ""
echo "=== api qwertz proxy ==="
curl -sfS http://127.0.0.1:4010/api/qwertz/health 2>&1 | head -c 400
echo ""
echo "=== remote env qwertz url ==="
grep '^QWERTZ_' /home/zweppe/morongwa-live/backend/.env | sed 's/=.*/=***/'
EOS`;

const cfg = mergeDeployConfig(repoRoot);
const conn = await sshConnect(cfg, repoRoot);
await execSsh(conn, cmd);
conn.end();
