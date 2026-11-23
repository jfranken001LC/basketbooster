#!/usr/bin/env bash
set -Eeuo pipefail
BACKUP="${1:?Usage: sudo bash scripts/Server_Git_AppOnly_Rollback.sh /var/www/basketbooster-build-backups/build-TIMESTAMP}"
APP_DIR="${APP_DIR:-/var/www/basketbooster}"
SERVICE="${SERVICE:-basketbooster}"
[[ -f "$BACKUP/server/index.js" ]] || { echo 'ERROR: invalid compiled build backup' >&2; exit 1; }
[[ "$BACKUP" == /var/www/basketbooster-build-backups/build-* ]] || { echo 'ERROR: backup must be one of the created build backups' >&2; exit 1; }
systemctl stop "$SERVICE"
rm -rf -- "$APP_DIR/build"
cp -a -- "$BACKUP" "$APP_DIR/build"
systemctl reset-failed "$SERVICE" || true
systemctl start "$SERVICE"
systemctl is-active --quiet "$SERVICE"
echo 'PASS: previous compiled build restored; source checkout unchanged.'
