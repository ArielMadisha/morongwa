#!/bin/sh
set -e
chown -R nginx:nginx /opt/hls 2>/dev/null || true
exec nginx -g "daemon off;"
