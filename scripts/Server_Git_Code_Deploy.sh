#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/basketbooster"
BRANCH="main"
REMOTE="origin"
SERVICE="basketbooster"

# Prefer keeping secrets OUTSIDE the repo:
#   sudo mkdir -p /etc/basketbooster
#   sudo nano /etc/basketbooster/basketbooster.env
#   sudo chmod 600 /etc/basketbooster/basketbooster.env
ENV_FILE_PRIMARY="/etc/basketbooster/basketbooster.env"
ENV_FILE_FALLBACK="${APP_DIR}/.env"

cd "$APP_DIR"

echo "==== Preflight ===="
echo "Repo: $APP_DIR"
echo "User: $(whoami)"
echo "Node: $(node -v || true)"
echo "NPM:  $(npm -v || true)"
echo

echo "==== Stop service (if running) ===="
sudo systemctl stop "$SERVICE" || true
echo

echo "==== Fetch + hard reset to ${REMOTE}/${BRANCH} ===="
git remote -v
git fetch "$REMOTE" --prune
git checkout -f "$BRANCH"
git reset --hard "${REMOTE}/${BRANCH}"
echo

echo "==== Clean ignored build artifacts (DO NOT remove env files) ===="
# NOTE:
#   git clean -fdX removes *ignored* files (including .env if .env is in .gitignore)
#   So we explicitly exclude env files.
git clean -fdX \
  -e ".env" \
  -e ".env.*" \
  -e "/.env" \
  -e "/.env.*"
echo

echo "==== Show current revision ===="
git status -sb || true
git rev-parse --short HEAD
echo

echo "==== Load env (required for prisma/build) ===="
ENV_FILE=""
if [[ -f "$ENV_FILE_PRIMARY" ]]; then
  ENV_FILE="$ENV_FILE_PRIMARY"
elif [[ -f "$ENV_FILE_FALLBACK" ]]; then
  ENV_FILE="$ENV_FILE_FALLBACK"
fi

if [[ -z "$ENV_FILE" ]]; then
  echo "ERROR: No env file found."
  echo "Expected one of:"
  echo "  - $ENV_FILE_PRIMARY   (recommended)"
  echo "  - $ENV_FILE_FALLBACK"
  exit 1
fi

echo "Using env file: $ENV_FILE"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${DATABASE_URL:?ERROR: DATABASE_URL is missing after loading env file. Fix your env file.}"
echo "DATABASE_URL is set."
echo

echo "==== Install dependencies (include dev deps for build) ===="
# Ensure devDependencies exist for build tooling
export NODE_ENV=development
npm ci
echo

echo "==== Prisma deploy ===="
npx prisma migrate deploy
npx prisma generate
echo

echo "==== Build app ===="
npm run build
echo

echo "==== Verify build output ===="
if [[ ! -f "${APP_DIR}/build/server/index.js" ]]; then
  echo "ERROR: build/server/index.js not found."
  echo "Build did not produce the expected React Router server output."
  echo "Run these for diagnostics:"
  echo "  ls -la build build/server || true"
  echo "  npm run build"
  exit 1
fi
ls -la build/server/index.js
echo

echo "==== Start app service ===="
sudo systemctl start "$SERVICE"
sudo systemctl status "$SERVICE" --no-pager -n 30 || true
echo

echo "==== Check listener on :3000 ===="
sudo ss -ltnp | grep ':3000' || true
echo

echo "==== Local health check (bypass nginx) ===="
curl -sS -I "http://127.0.0.1:${PORT:-3000}/" || true
echo

echo "==== Done ===="
