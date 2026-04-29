#!/bin/sh
# 보존기간 초과 백업 정리 (DESIGN §7.1)
set -eu

KEEP="${BACKUP_RETENTION_DAYS:-30}"
BASE="${BACKUP_DIR:-/var/sam-scheduler/backup/daily}"

[ -d "$BASE" ] || exit 0
find "$BASE" -mindepth 1 -maxdepth 1 -type d -mtime "+${KEEP}" -exec rm -rf {} +
echo "[cleanup] removed entries older than ${KEEP} days under $BASE"
