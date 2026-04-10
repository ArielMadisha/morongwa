set -e
APP_DIR=/home/zweppe/morongwa-live
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
tar -xzf /home/zweppe/morongwa-deploy-clean.tgz -C "$APP_DIR"

docker rm -f morongwa-api-test morongwa-web-test >/dev/null 2>&1 || true

docker run -d --name morongwa-api-test \
  --network shared-network \
  -p 4010:4010 \
  -v "$APP_DIR/backend:/app" \
  -w /app \
  -e PORT=4010 \
  node:20-bullseye \
  bash -lc "npm install --include=dev && NODE_ENV=production npm run build && NODE_ENV=production npm run start"

docker run -d --name morongwa-web-test \
  --network shared-network \
  -p 3010:3010 \
  -v "$APP_DIR/frontend:/app" \
  -w /app \
  -e NEXT_PUBLIC_API_URL=https://api.qwertymates.com/api \
  node:20-bullseye \
  bash -lc "npm install --include=dev && NODE_ENV=production npm run build && NODE_ENV=production npm run start -- -p 3010"

sleep 20
docker ps -a --format '{{.Names}} {{.Status}} {{.Ports}}' | grep -E 'morongwa-api-test|morongwa-web-test' || true
