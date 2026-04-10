/**
 * Provision realtime infra on the DigitalOcean server:
 * - coturn (TURN/STUN for mobile WebRTC)
 * - nginx + nginx-rtmp (RTMP ingest + HLS playback)
 * - basic UFW rules
 *
 * Usage:
 *   node scripts/setupRealtimeInfraRemote.mjs --dry-run
 *   node scripts/setupRealtimeInfraRemote.mjs
 */
import { Client } from "ssh2";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

function loadKv(absPath) {
  const o = {};
  if (!fs.existsSync(absPath)) return o;
  let text = fs.readFileSync(absPath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim().replace(/\r/g, "");
    let val = t.slice(i + 1).trim().replace(/\r/g, "");
    const hash = val.indexOf(" #");
    if (hash >= 0) val = val.slice(0, hash).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    o[key] = val;
  }
  return o;
}

function mergeDeployConfig() {
  const config = loadKv(path.join(repoRoot, "deploy-server.config"));
  const secrets = loadKv(path.join(repoRoot, "deploy-server.secrets"));
  return { ...config, ...secrets };
}

function parseHostUser(cfg) {
  const raw = (cfg.DEPLOY_SSH_HOST || "").trim();
  if (raw.includes("@")) {
    const at = raw.indexOf("@");
    return { user: raw.slice(0, at).trim(), host: raw.slice(at + 1).trim() };
  }
  return { user: (cfg.DEPLOY_SSH_USER || "root").trim(), host: raw.trim() };
}

function esc(v) {
  return String(v || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function must(cfg, key) {
  const v = (cfg[key] || "").trim();
  if (!v) throw new Error(`Missing ${key} in deploy-server.secrets`);
  return v;
}

function buildRemoteScript(cfg) {
  const turnRealm = must(cfg, "TURN_REALM");
  const turnUser = must(cfg, "TURN_USERNAME");
  const turnPass = must(cfg, "TURN_PASSWORD");
  const hlsDomain = (cfg.LIVESTREAM_HLS_DOMAIN || cfg.PUBLIC_APP_DOMAIN || "").trim();
  const hlsPort = parseInt(cfg.LIVESTREAM_HLS_PORT || "8081", 10) || 8081;
  const hlsPath = (cfg.LIVESTREAM_HLS_PATH || "/var/www/morongwa-hls").trim();

  return `bash -lc "
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y coturn nginx libnginx-mod-rtmp ufw

mkdir -p ${esc(hlsPath)}
chown -R www-data:www-data ${esc(hlsPath)}

cat > /etc/turnserver.conf <<'EOF'
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
lt-cred-mech
realm=${esc(turnRealm)}
user=${esc(turnUser)}:${esc(turnPass)}
total-quota=100
bps-capacity=0
stale-nonce=600
no-loopback-peers
no-multicast-peers
min-port=10000
max-port=20000
EOF

sed -i 's/^#\\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
systemctl enable coturn
systemctl restart coturn

cat > /etc/nginx/rtmp.conf <<'EOF'
rtmp {
  server {
    listen 1935;
    chunk_size 4096;

    application live {
      live on;
      record off;
      hls on;
      hls_path ${esc(hlsPath)};
      hls_fragment 2s;
      hls_playlist_length 8s;
      allow publish all;
      allow play all;
    }
  }
}
EOF

awk '/include \\/etc\\/nginx\\/rtmp.conf;/{f=1} END{exit(f?0:1)}' /etc/nginx/nginx.conf || \
  sed -i '/^events {/i include /etc/nginx/rtmp.conf;' /etc/nginx/nginx.conf

cat > /etc/nginx/conf.d/morongwa-hls.conf <<'EOF'
server {
  listen ${hlsPort};
  server_name ${esc(hlsDomain || "_")};

  location /hls {
    alias ${esc(hlsPath)};
    add_header Cache-Control no-cache;
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Headers *;
    types {
      application/vnd.apple.mpegurl m3u8;
      video/mp2t ts;
    }
  }
}
EOF

rm -f /etc/nginx/conf.d/morongwa-rtmp.conf /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf
nginx -t
systemctl enable nginx
systemctl restart nginx

ufw allow 22/tcp || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw allow 1935/tcp || true
ufw allow ${hlsPort}/tcp || true
ufw allow 3478/tcp || true
ufw allow 3478/udp || true
ufw allow 5349/tcp || true
ufw allow 10000:20000/udp || true

echo 'Realtime infra setup complete.'
echo 'TURN: turn:${esc(cfg.DEPLOY_SSH_HOST?.split("@").pop() || "")}:3478?transport=udp'
echo 'HLS test URL: http://${esc(hlsDomain || cfg.DEPLOY_SSH_HOST?.split("@").pop() || "")}:${hlsPort}/hls'
"
`;
}

function execSsh(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => process.stdout.write(String(d)));
      stream.stderr.on("data", (d) => process.stderr.write(String(d)));
      stream.on("close", (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`Remote exit ${code}${signal ? ` (${signal})` : ""}`));
      });
    });
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const envPass = (process.env.DEPLOY_SSH_PASSWORD || "").trim();
  const cfg = mergeDeployConfig();
  if (envPass) cfg.DEPLOY_SSH_PASSWORD = envPass;

  const { user, host } = parseHostUser(cfg);
  const password = (cfg.DEPLOY_SSH_PASSWORD || "").trim();
  const port = parseInt(cfg.DEPLOY_SSH_PORT || "22", 10) || 22;
  if (!host) throw new Error("Missing DEPLOY_SSH_HOST in deploy-server.config");
  if (!password) throw new Error("Missing DEPLOY_SSH_PASSWORD in deploy-server.secrets");

  const script = buildRemoteScript(cfg);
  if (dryRun) {
    console.log(script);
    return;
  }

  const conn = await new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => resolve(c))
      .on("error", reject)
      .connect({ host, username: user, password, port, readyTimeout: 120000 });
  });

  await execSsh(conn, script);
  conn.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

