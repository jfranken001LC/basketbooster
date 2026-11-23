#!/usr/bin/env bash
# App-only, staged Git deployment. Does NOT deploy Shopify Functions or run DB migrations.
set -Eeuo pipefail
APP_DIR="${APP_DIR:-/var/www/basketbooster}"
BRANCH="${BRANCH:-main}"
SERVICE="${SERVICE:-basketbooster}"
ENV_FILE="${ENV_FILE:-/etc/basketbooster/basketbooster.env}"
PORT="${PORT:-3000}"
BACKUP_BASE="${BACKUP_BASE:-/var/www/basketbooster-build-backups}"
STAGE=""
PREVIOUS=""
SWAPPED=0
STARTED=0
cleanup() { if [[ -n "$STAGE" && -d "$STAGE" ]]; then rm -rf -- "$STAGE"; fi; }
rollback() {
  local rc=$?
  trap - ERR
  if [[ "$SWAPPED" == 1 && -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    echo "ERROR: deployment failed (exit $rc); restoring previous compiled build"
    sudo systemctl stop "$SERVICE" || true
    rm -rf -- "$APP_DIR/build"
    cp -a -- "$PREVIOUS" "$APP_DIR/build"
    sudo systemctl reset-failed "$SERVICE" || true
    sudo systemctl start "$SERVICE" || true
  fi
  cleanup
  exit "$rc"
}
trap rollback ERR
trap cleanup EXIT
[[ -d "$APP_DIR/.git" ]] || { echo "ERROR: $APP_DIR is not a Git checkout" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "ERROR: missing environment file" >&2; exit 1; }
[[ -f "$APP_DIR/package-lock.json" ]] || { echo "ERROR: missing live lockfile" >&2; exit 1; }
[[ -f "$APP_DIR/build/server/index.js" ]] || { echo "ERROR: existing build is missing, stop and recover first" >&2; exit 1; }
mkdir -p "$BACKUP_BASE"
REMOTE_URL="$(git -C "$APP_DIR" remote get-url origin)"
STAGE="$(mktemp -d /var/www/.basketbooster-stage.XXXXXXXX)"
git clone --quiet --single-branch --branch "$BRANCH" "$REMOTE_URL" "$STAGE"
# Fail closed if stage dependency lock differs from installed production dependency tree.
if ! cmp -s "$APP_DIR/package-lock.json" "$STAGE/package-lock.json"; then
  echo 'ERROR: package-lock.json changed. This build-only deploy does not replace production node_modules.' >&2
  echo 'Use a reviewed full-release procedure for dependency updates.' >&2
  exit 1
fi
# Load env after fetching, avoid printing any credentials.
if [[ -r "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
else
  # Read as root only where the service operator cannot read the file.
  set -a; source <(sudo -n cat "$ENV_FILE"); set +a
fi
export VITE_SHOPIFY_API_KEY="${VITE_SHOPIFY_API_KEY:-${SHOPIFY_API_KEY:-}}"
[[ -n "$VITE_SHOPIFY_API_KEY" ]] || { echo 'ERROR: no Shopify API key for Vite build' >&2; exit 1; }
[[ -n "${DATABASE_URL:-}" ]] || { echo 'ERROR: DATABASE_URL missing' >&2; exit 1; }
# Do not perform any Prisma migration or connect to the production database.
cd "$STAGE"
export NODE_ENV=development
npm ci --no-audit --fund=false
npx prisma generate
npm run build
[[ -s "$STAGE/build/server/index.js" ]] || { echo 'ERROR: missing staged server build' >&2; exit 1; }
# Source version must be captured for manual confirmation.
echo "Staged revision: $(git rev-parse --short HEAD)"
# The old build remains on disk as a timestamped rollback copy.
PREVIOUS="$BACKUP_BASE/build-$(date -u +%Y%m%dT%H%M%SZ)"
cp -a -- "$APP_DIR/build" "$PREVIOUS"
[[ -s "$PREVIOUS/server/index.js" ]] || { echo 'ERROR: backup verification failed' >&2; exit 1; }
# One-time brief switch after staged build succeeded.
sudo systemctl stop "$SERVICE"
rm -rf -- "$APP_DIR/build"
cp -a -- "$STAGE/build" "$APP_DIR/build"
SWAPPED=1
sudo systemctl reset-failed "$SERVICE" || true
sudo systemctl start "$SERVICE"
sleep 3
sudo systemctl is-active --quiet "$SERVICE"
HTTP_CODE="$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/")"
if [[ "$HTTP_CODE" != 200 && "$HTTP_CODE" != 302 ]]; then
  echo "ERROR: local HTTP health check returned $HTTP_CODE" >&2
  false
fi
echo "PASS: app-only build deployed, service active, local HTTP $HTTP_CODE"
echo "Backup: $PREVIOUS"
echo 'IMPORTANT: test Shopify Admin embedded home + Discount Manager manually.'
echo 'If embedded auth fails, run the rollback script with this backup path.'
