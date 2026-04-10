#!/usr/bin/env bash
# Sync Morongwa to a Linux VPS (e.g. DigitalOcean Droplet), install deps, build, restart.
# Usage: ./scripts/deploy-to-server.sh
# Requires: deploy-server.config (copy from deploy-server.config.example)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$ROOT_DIR/deploy-server.config"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Config not found. Copy deploy-server.config.example to deploy-server.config"
  echo "  cp deploy-server.config.example deploy-server.config"
  echo "  # Set DEPLOY_SSH_HOST and DEPLOY_REMOTE_PATH"
  exit 1
fi

# shellcheck source=/dev/null
source "$CONFIG_FILE"
: "${DEPLOY_SSH_HOST:?Set DEPLOY_SSH_HOST in deploy-server.config}"
: "${DEPLOY_REMOTE_PATH:?Set DEPLOY_REMOTE_PATH in deploy-server.config}"

SSH_OPTS=""
[[ -n "$DEPLOY_SSH_KEY" ]] && SSH_OPTS="-i $DEPLOY_SSH_KEY"

cd "$ROOT_DIR"

echo "==> Syncing to $DEPLOY_SSH_HOST:$DEPLOY_REMOTE_PATH ..."
rsync -avz --progress --delete \
  -e "ssh $SSH_OPTS" \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=dist \
  --exclude=.git \
  --exclude=.env \
  --exclude='*.log' \
  --exclude='.env.*' \
  ./ "$DEPLOY_SSH_HOST:$DEPLOY_REMOTE_PATH/"

echo "==> Installing and building on server..."
ssh $SSH_OPTS "$DEPLOY_SSH_HOST" "cd $DEPLOY_REMOTE_PATH/backend && npm install && npm run build"
ssh $SSH_OPTS "$DEPLOY_SSH_HOST" "cd $DEPLOY_REMOTE_PATH/frontend && npm install && npm run build"

echo "==> Restarting services..."
ssh $SSH_OPTS "$DEPLOY_SSH_HOST" "cd $DEPLOY_REMOTE_PATH && (pm2 restart all 2>/dev/null || echo 'Tip: pm2 start backend/dist/server.js --name api; pm2 start \"npm run start\" --name web -c frontend')"

echo "==> Done."
