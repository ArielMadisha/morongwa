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
  --restart unless-stopped \
  --network shared-network \
  -p 3010:3010 \
  -v "$APP_DIR/frontend:/app" \
  -w /app \
  -e NEXT_PUBLIC_API_URL=https://api.qwertymates.com/api \
  node:20-bullseye \
  bash -lc "npm install --include=dev && NODE_ENV=production npm run build && rm -rf .next/cache && NODE_ENV=production npm run start -- -p 3010"

echo "==> Waiting for production build + server (up to 15 min)..."
ready=0
for i in $(seq 1 90); do
  if ! docker ps --format '{{.Names}}' | grep -q '^morongwa-web-test$'; then
    echo "ERROR: morongwa-web-test exited during build/start."
    docker logs --tail=400 morongwa-web-test || true
    exit 1
  fi
  chunk_count="$(docker exec morongwa-web-test sh -lc 'ls -1 /app/.next/static/chunks/*.js 2>/dev/null | wc -l' 2>/dev/null | tr -d ' \n' || echo 0)"
  wall_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 http://127.0.0.1:3010/ || true)"
  if [ "${chunk_count:-0}" -ge 80 ] && [ "$wall_code" = "200" ]; then
    ready=1
    echo "OK: ${chunk_count} JS chunks, GET / -> ${wall_code} (attempt ${i})"
    break
  fi
  echo "  ... build/start in progress (chunks=${chunk_count:-0}, /=${wall_code}) ${i}/90"
  sleep 10
done
if [ "$ready" -ne 1 ]; then
  echo "ERROR: frontend did not become ready in time."
  docker logs --tail=400 morongwa-web-test || true
  exit 1
fi

echo "==> Verifying homepage-referenced static chunks on upstream..."
html="$(curl -s --max-time 20 http://127.0.0.1:3010/ || true)"
fail=0
checked=0
while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  checked=$((checked + 1))
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "http://127.0.0.1:3010/${rel}" || true)"
  if [ "$code" != "200" ]; then
    echo "ERROR: ${rel} -> HTTP ${code}"
    fail=1
  fi
  if [ "$checked" -ge 12 ]; then
    break
  fi
done <<EOF
$(echo "$html" | grep -oE '_next/static/chunks/[^" ]+\.js' | sort -u | head -12)
EOF
if [ "$fail" -ne 0 ]; then
  docker logs --tail=200 morongwa-web-test || true
  exit 1
fi

for path in /wall /login; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "http://127.0.0.1:3010${path}" || true)"
  if [ "$code" != "200" ] && [ "$code" != "301" ] && [ "$code" != "302" ]; then
    echo "ERROR: ${path} -> HTTP ${code}"
    exit 1
  fi
done

docker ps -a --format '{{.Names}} {{.Status}} {{.Ports}}' | grep morongwa-web-test || true
echo "Frontend deploy health checks passed."
