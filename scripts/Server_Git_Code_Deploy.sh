#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/basketbooster"
BRANCH="main"
REMOTE="origin"
SERVICE="basketbooster"
ENV_FILE="/etc/basketbooster/basketbooster.env"
PORT_DEFAULT="3000"

cd "$APP_DIR"

echo "==== Preflight ===="
echo "Repo: $APP_DIR"
echo "User: $(whoami)"
echo "Node: $(node -v)"
echo "NPM:  $(npm -v)"
echo

echo "==== Stop service (if running) ===="
sudo systemctl stop "$SERVICE" >/dev/null 2>&1 || true
echo

echo "==== Fetch + hard reset to ${REMOTE}/${BRANCH} ===="
git fetch --all --prune
git checkout "$BRANCH"
git reset --hard "${REMOTE}/${BRANCH}"
echo

echo "==== Clean ignored/untracked build artifacts (DO NOT remove env files) ===="
# -x = remove ALL untracked (including ignored)
# -e = exclude patterns (protect env files if present in repo)
git clean -fdx \
  -e ".env" \
  -e ".env.*"
echo

echo "==== Show current revision ===="
git --no-pager log -1 --oneline
echo

echo "==== Load env (required for prisma/build) ===="
if [[ -f "$ENV_FILE" ]]; then
  if [[ -r "$ENV_FILE" ]]; then
    echo "Using env file (direct): $ENV_FILE"
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  else
    echo "Env file not readable by $(whoami). Using sudo to load: $ENV_FILE"
    set -a
    # shellcheck disable=SC1090
    source <(sudo cat "$ENV_FILE")
    set +a
  fi
else
  echo "ERROR: Env file not found: $ENV_FILE"
  echo "Create it and include DATABASE_URL at minimum."
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set after loading env. Prisma cannot run."
  exit 1
fi

export PORT="${PORT:-$PORT_DEFAULT}"
echo "PORT=$PORT"
echo

echo "==== Install dependencies (include dev deps for build) ===="
# npm ci includes dev deps unless you explicitly omit them.
# Force non-production mode to prevent any environment-based omits.
export NODE_ENV="development"
npm ci --no-audit --fund=false
echo

echo "==== Prisma deploy ===="
npx prisma migrate deploy
npx prisma generate
echo

echo "==== Build function extension(s) ===="
# Your package.json already defines build:function
npm run build:function
echo

echo "==== Build app ===="
npm run build
echo

echo "==== Verify server entry exists ===="
if [[ ! -f "build/server/index.js" ]]; then
  echo "ERROR: build/server/index.js not found."
  echo "Listing likely candidates:"
  find . -maxdepth 6 -type f -path "*build*/server/index.js" -print || true
  exit 1
fi
ls -la build/server/index.js
echo

echo "==== Reset service failure state + restart ===="
sudo systemctl reset-failed "$SERVICE" || true
sudo systemctl start "$SERVICE"
sudo systemctl status "$SERVICE" --no-pager -n 25 -l
echo

echo "==== Local health check (bypass nginx) ===="
curl -sS -I "http://127.0.0.1:${PORT}/" || true
echo

echo "==== Done ===="
