#!/bin/sh
# 일자별 SQLite 시스템 백업 (DESIGN §7.1)
set -eu

DAY=$(date +%Y%m%d)
DEST_DIR="${BACKUP_DIR:-/var/seedcore-scheduler/backup/daily}/$DAY"
DB_PATH="${DB_PATH:-/var/seedcore-scheduler/data/app.db}"

mkdir -p "$DEST_DIR"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

sqlite3 "$DB_PATH" "VACUUM INTO '$TMP/app.db'"
gzip -9 "$TMP/app.db"
mv "$TMP/app.db.gz" "$DEST_DIR/app.db.gz"
( cd "$DEST_DIR" && sha256sum app.db.gz > app.db.gz.sha256 )

SIZE=$(stat -c%s "$DEST_DIR/app.db.gz" 2>/dev/null || stat -f%z "$DEST_DIR/app.db.gz")
echo "[backup] $DEST_DIR/app.db.gz ${SIZE} bytes"
