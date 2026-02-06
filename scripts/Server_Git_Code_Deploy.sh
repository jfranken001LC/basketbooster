#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/basketbooster"
BRANCH="main"
REMOTE="origin"
PORT_DEFAULT="3000"

cd "$APP_DIR"

echo "==== Preflight ===="
if [ ! -d ".git" ]; then
  echo "ERROR: $APP_DIR is not a git repo (missing .git)."
  exit 1
fi

echo "Repo: $(pwd)"
echo "User: $(whoami)"
echo "Node: $(node -v 2>/dev/null || true)"
echo "NPM:  $(npm -v 2>/dev/null || true)"
echo

echo "==== Stop service (if running) ===="
sudo systemctl stop basketbooster || true
sudo systemctl reset-failed basketbooster || true

echo "==== Fetch + hard reset to ${REMOTE}/${BRANCH} ===="
git remote -v
git fetch "$REMOTE" --prune --tags
git checkout "$BRANCH"
git reset --hard "${REMOTE}/${BRANCH}"

echo "==== Clean untracked files (keep .env) ===="
# -fd  : remove untracked files/dirs
# -X   : only remove ignored files (safer than -x)
# -e   : exclude patterns (preserve env)
git clean -fdX -e ".env" -e ".env.*"

echo "==== Show current revision ===="
git status -sb
git log -1 --oneline --decorate
echo

echo "==== Install dependencies (include dev deps for build) ===="
# Ensure build tooling is present even on production servers
export NODE_ENV=development
npm ci

echo "==== Load env (for prisma/build) ===="
# Prefer an external env file if you later move secrets out of the repo
# Example: /etc/basketbooster/basketbooster.env
if [ -f "/etc/basketbooster/basketbooster.env" ]; then
  echo "Using /etc/basketbooster/basketbooster.env"
  set -a
  # shellcheck disable=SC1091
  source "/etc/basketbooster/basketbooster.env"
  set +a
elif [ -f ".env" ]; then
  echo "Using .env in repo"
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
else
  echo "WARN: No .env found. Prisma/build may fail if env vars are required."
fi

echo "==== Prisma deploy ===="
npx prisma migrate deploy
npx prisma generate

echo "==== Build app ===="
npm run build

echo "==== Validate server build entry ===="
ENTRY="build/server/index.js"
if [ ! -f "$ENTRY" ]; then
  echo "ERROR: $ENTRY not found."
  echo "---- Quick search for server entry ----"
  find . -maxdepth 6 -type f -path "*server/index.js" -o -path "*server/index.mjs" | sed 's|^\./||' || true
  echo
  echo "Most likely cause: build failed earlier OR build output path differs."
  echo "Check: npm run build output above, and ensure your start script matches actual output."
  exit 1
fi
echo "Found: $ENTRY"

echo "==== Start service ===="
sudo systemctl start basketbooster

echo "==== Service status ===="
sudo systemctl status basketbooster --no-pager -n 25 || true

echo "==== Quick health check ===="
PORT="${PORT:-$PORT_DEFAULT}"
curl -I "http://127.0.0.1:${PORT}/" || true

echo "==== Done ===="
