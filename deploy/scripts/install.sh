#!/bin/sh
# 오프라인(에어갭) 환경 설치 스크립트
set -eu

HERE="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$HERE/.env" ]; then
  cp "$HERE/.env.example" "$HERE/.env"
  echo "[install] $HERE/.env 생성. SESSION_SECRET / INITIAL_ADMIN_* 를 편집하세요."
fi

# 에어갭 환경: deploy/images/*.tar 이 있으면 docker load
if [ -d "$HERE/images" ]; then
  for tar in "$HERE/images"/*.tar; do
    [ -f "$tar" ] || continue
    echo "[install] docker load $tar"
    docker load -i "$tar"
  done
fi

cd "$HERE"
docker compose up -d

cat <<EOF

[install] 완료.

다음 단계:
  1) 브라우저로 http://<host>:\${HTTP_PORT:-8080} 접속
  2) .env 의 INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD 로 로그인 후 패스워드 변경
  3) 호스트 cron 에 일자별 백업 등록 (예시 — BACKUP_CRON 시각 사용):
       0 4 * * * docker exec sam-api sh /app/deploy/scripts/full-backup.sh
EOF
