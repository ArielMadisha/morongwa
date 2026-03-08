#!/usr/bin/env bash
# Sync Morongwa to Linode, install deps, build, and restart
# Usage: ./scripts/deploy-to-linode.sh
# Requires: deploy-linode.config (copy from deploy-linode.config.example)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$ROOT_DIR/deploy-linode.config"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Config not found. Copy deploy-linode.config.example to deploy-linode.config"
  echo "  cp deploy-linode.config.example deploy-linode.config"
  echo "  # Edit deploy-linode.config and set LINODE_HOST, LINODE_PATH"
  exit 1
fi

source "$CONFIG_FILE"
: "${LINODE_HOST:?Set LINODE_HOST in deploy-linode.config}"
: "${LINODE_PATH:?Set LINODE_PATH in deploy-linode.config}"

SSH_OPTS=""
[[ -n "$LINODE_SSH_KEY" ]] && SSH_OPTS="-i $LINODE_SSH_KEY"

cd "$ROOT_DIR"

echo "==> Syncing to $LINODE_HOST:$LINODE_PATH ..."
rsync -avz --progress --delete \
  -e "ssh $SSH_OPTS" \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=dist \
  --exclude=.git \
  --exclude=.env \
  --exclude='*.log' \
  --exclude='.env.*' \
  ./ "$LINODE_HOST:$LINODE_PATH/"

echo "==> Installing and building on server..."
ssh $SSH_OPTS $LINODE_HOST "cd $LINODE_PATH/backend && npm install && npm run build"
ssh $SSH_OPTS $LINODE_HOST "cd $LINODE_PATH/frontend && npm install && npm run build"

echo "==> Restarting services..."
ssh $SSH_OPTS $LINODE_HOST "cd $LINODE_PATH && (pm2 restart all 2>/dev/null || echo 'Tip: pm2 start backend/dist/server.js --name api; pm2 start \"npm run start\" --name web -c frontend')"

echo "==> Done! Synced to Linode."
