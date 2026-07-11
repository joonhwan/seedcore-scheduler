# SeedCore Scheduler (시드코어 일정관리 시스템)

사내 폐쇄망(Air-gap) 환경용 프로젝트 일정관리 웹 애플리케이션. 상세 설계는 [DESIGN.md](./DESIGN.md) 참고.

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

> **순서가 중요합니다.** 1~4 를 먼저 완료해야 5 의 `pnpm dev` 가 정상 부팅합니다.
> Prisma Client / DB 가 없으면 NestJS 가 부트시 크래시 → web 의 `/api/*` 프록시가 ECONNREFUSED.

```bash
# 1) 의존성 설치
pnpm install

# 2) 공유 패키지 빌드 (web/api 가 컴파일된 dist 를 참조)
pnpm -F @sam/shared build

# 3) API 환경변수
cp apps/api/.env.example apps/api/.env

# 4) Prisma 마이그레이션 + 클라이언트 생성 + DB 파일 생성
pnpm -F @sam/api prisma:migrate:dev
#    → apps/api/prisma/migrations/<timestamp>_init/
#    → apps/api/prisma/data/app.db (Prisma 의 file: URL 은 schema.prisma 위치 기준 상대경로)

# 5) 개발 서버 (api: 3000, web: 5173)
pnpm dev
```

브라우저: http://localhost:5173 — Vite 가 `/api/*` 를 `localhost:3000` 으로 프록시.

### 자주 만나는 문제

| 증상 | 원인 / 해결 |
|---|---|
| web 콘솔에 `[vite] http proxy error /api/v1/...  ECONNREFUSED` | api 가 안 떴음. `apps/api dev` 로그 확인. 보통 4번 단계(prisma:migrate:dev)를 건너뛴 경우 |
| `Cannot find module '...apps/api/dist/main'` | tsbuildinfo 캐시가 emit 을 스킵. `apps/api/tsconfig.json` 의 `incremental: false` 가 적용되어 있어야 하며, 해결 안 되면 `apps/api/tsconfig.tsbuildinfo` 와 `apps/api/dist` 삭제 후 재시작 |
| `The "class-validator" package is missing` | 본 프로젝트는 zod 사용. `ValidationPipe` 를 추가하지 말 것 |
| `Execute returned results, which is not allowed in SQLite` (P2010) | PRAGMA 류는 결과 행을 반환하므로 Prisma 의 `$queryRawUnsafe` 사용 (`$executeRawUnsafe` 불가) |

## 운영(에어갭) 설치

1. 사내 망 외부에서 빌드:
   ```bash
   cd deploy
   docker compose build
   docker save seedcore-scheduler-api:0.1.0   -o images/api.tar
   docker save seedcore-scheduler-nginx:0.1.0 -o images/nginx.tar
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
