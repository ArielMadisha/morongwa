set -e
APP_DIR=/home/zweppe/morongwa-live
mkdir -p "$APP_DIR"
tar -xzf /home/zweppe/morongwa-deploy.tgz -C "$APP_DIR"

cd "$APP_DIR/backend"
npm install --omit=dev
npm install typescript --save-dev
npm run build

if [ -f "$APP_DIR/backend/.env" ]; then
  sed -i 's/^PORT=.*/PORT=4010/' "$APP_DIR/backend/.env" || true
else
  echo "Missing backend .env in upload"; exit 1
fi

cd "$APP_DIR/frontend"
npm install
npm run build

cat > "$APP_DIR/frontend/.env.production" <<'EOF'
NEXT_PUBLIC_API_URL=https://api.qwertymates.com/api
EOF

pkill -f "node dist/server.js" || true
pkill -f "next start -p 3010" || true

cd "$APP_DIR/backend"
nohup node dist/server.js > /home/zweppe/morongwa-backend.log 2>&1 &
cd "$APP_DIR/frontend"
nohup npm run start -- -p 3010 > /home/zweppe/morongwa-frontend.log 2>&1 &

sleep 6
curl -sS -m 15 http://127.0.0.1:4010/api/health || true
curl -sS -m 15 http://127.0.0.1:3010 || true
