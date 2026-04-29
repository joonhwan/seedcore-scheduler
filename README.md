# SAM Scheduler

사내(Air-gap) 환경용 프로젝트 일정관리 웹. 상세 설계는 [DESIGN.md](./DESIGN.md) 참고.

## 구성

```
apps/api          NestJS + Prisma + SQLite
apps/web          React + Vite + Tailwind
packages/shared   zod 스키마 / 공유 타입
deploy/           docker compose, nginx, 백업 스크립트
```

## 사전 요구사항

- Node.js 20.x
- pnpm 9.x (`corepack enable && corepack use pnpm@9`)
- Docker (운영/오프라인 번들 시)

## 로컬 개발

```bash
# 의존성 설치
pnpm install

# 공유 패키지 빌드 (web/api 가 참조)
pnpm -F @sam/shared build

# API 환경변수
cp apps/api/.env.example apps/api/.env

# DB 초기화 (apps/api/data/app.db 생성)
pnpm -F @sam/api prisma:migrate:dev

# 개발 서버 (api: 3000, web: 5173)
pnpm dev
```

브라우저: http://localhost:5173 — Vite 가 `/api/*` 를 `localhost:3000` 으로 프록시.

## 운영(에어갭) 설치

1. 사내 망 외부에서 빌드:
   ```bash
   cd deploy
   docker compose build
   docker save sam-scheduler-api:0.1.0   -o images/api.tar
   docker save sam-scheduler-nginx:0.1.0 -o images/nginx.tar
   ```
2. `deploy/` 폴더 전체(+ `images/`)를 사내 서버로 전달.
3. 서버에서:
   ```bash
   sh scripts/install.sh
   ```
   - `.env` 가 자동 생성됩니다. `SESSION_SECRET` / `INITIAL_ADMIN_*` 편집 후 `docker compose up -d` 다시 실행.
4. 호스트 cron 에 일자별 백업 등록 (DESIGN §7.1 — 기본 04:00 KST):
   ```
   0 4 * * * docker exec sam-api sh /app/deploy/scripts/full-backup.sh
   ```

## 첫 로그인

- `.env` 의 `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` 로 로그인 → 첫 로그인 시 패스워드 변경 강제.
- ADMIN 계정은 1개만 운영 (DESIGN §12-⑥).

## 다음 마일스톤

- M1: 인증 / 사용자 관리 / 패스워드 리셋 / 세션(슬라이딩 30분) / 감사로그
- 이후 일정은 [DESIGN.md §11](./DESIGN.md#11-개발-로드맵) 참고.
