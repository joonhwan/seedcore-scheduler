#!/bin/sh
# 시스템 복원 — 서비스를 정지한 상태에서 실행하세요.
# 사용: restore-system.sh YYYYMMDD
set -eu

DAY="${1:?usage: restore-system.sh YYYYMMDD}"
SRC="${BACKUP_DIR:-/var/seedcore-scheduler/backup/daily}/$DAY/app.db.gz"
DB_PATH="${DB_PATH:-/var/seedcore-scheduler/data/app.db}"

[ -f "$SRC" ] || { echo "no backup at $SRC"; exit 1; }

( cd "$(dirname "$SRC")" && sha256sum -c app.db.gz.sha256 )

echo "[restore] decompressing to $DB_PATH"
gunzip -c "$SRC" > "$DB_PATH.new"
if [ -f "$DB_PATH" ]; then
  mv "$DB_PATH" "$DB_PATH.bak.$(date +%s)"
fi
mv "$DB_PATH.new" "$DB_PATH"
echo "[restore] done. start the service."
