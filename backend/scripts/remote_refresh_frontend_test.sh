set -e
# Override for your server (e.g. DigitalOcean root): export before running, or pass from SSH:
#   MORONGWA_STAGING_PARENT=/root MORONGWA_LIVE_DIR=/var/www/morongwa bash remote_refresh_frontend_test.sh
STAGING_PARENT="${MORONGWA_STAGING_PARENT:-/home/zweppe}"
APP_DIR="${MORONGWA_LIVE_DIR:-/home/zweppe/morongwa-live}"
TGZ="${MORONGWA_FRONTEND_TGZ:-$STAGING_PARENT/morongwa-frontend-only.tgz}"

mkdir -p "$APP_DIR"
mkdir -p "$STAGING_PARENT"
tar -xzf "$TGZ" -C "$STAGING_PARENT"
rm -rf "$APP_DIR/frontend"
mv "$STAGING_PARENT/morongwa-frontend-only" "$APP_DIR/frontend"

docker rm -f morongwa-web-test >/dev/null 2>&1 || true
docker run -d --name morongwa-web-test \
  --network shared-network \
  -p 3010:3010 \
  -v "$APP_DIR/frontend:/app" \
  -w /app \
  -e NEXT_PUBLIC_API_URL=https://api.qwertymates.com/api \
  node:20-bullseye \
  bash -lc "npm install --include=dev && NODE_ENV=production npm run build && NODE_ENV=production npm run start -- -p 3010"

sleep 20
docker ps -a --format '{{.Names}} {{.Status}} {{.Ports}}' | grep morongwa-web-test || true
