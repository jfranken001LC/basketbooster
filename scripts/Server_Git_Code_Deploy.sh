#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/basketbooster"
cd "$APP_DIR"

echo "==== Stopping app service ===="
sudo systemctl stop basketbooster || true

echo "==== Updating code from origin/main ===="
git fetch --all --prune
git checkout main
git reset --hard origin/main

echo "==== Installing dependencies (include dev deps for build) ===="
# Ensure build tooling is present even on production servers
export NODE_ENV=development
npm ci

echo "==== Loading env for prisma/build ===="
set -a
source .env
set +a

echo "==== Prisma deploy ===="
npx prisma migrate deploy
npx prisma generate

echo "==== Building app ===="
npm run build

if [ ! -f "build/server/index.js" ]; then
  echo "ERROR: build/server/index.js not found. Build failed."
  exit 1
fi

echo "==== Restarting app service ===="
sudo systemctl start basketbooster
sudo systemctl status basketbooster --no-pager -n 25

echo "==== Quick health check ===="
curl -I http://127.0.0.1:${PORT:-3000}/ || true

echo "==== Done ===="
