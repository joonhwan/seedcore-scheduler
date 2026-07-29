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

- Node.js 20.x 이상
- pnpm 11.x (`corepack enable` — 버전은 루트 `package.json` 의 `packageManager` 필드가 결정하므로 별도 지정 불필요)
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

### node_modules 를 다시 깐 뒤 (재설치 후)

`pnpm` 버전 업그레이드, `pnpm install --force`, `node_modules` 수동 삭제 등으로 의존성을 갈아엎은 경우
**위 2번(shared build)과 4번(prisma) 단계를 다시 수행해야 합니다.**

- `packages/shared/dist` 와 `node_modules/.prisma/client` 는 `pnpm install` 이 복원해 주지 않는 **별도 생성물**입니다.
- `apps/api` 의 `postinstall`(`apps/api/scripts/postinstall.js`)이 `prisma generate` 를 자동 수행하므로
  보통은 4번을 따로 돌리지 않아도 됩니다. 단 **generate 가 실패하면 `pnpm install` 이 함께 실패합니다**
  (스텁 상태로 개발이 시작되는 것을 막기 위한 의도적 동작). 스키마가 없는 환경(Docker 빌더 단계)에서는 조용히 건너뜁니다.
- 따라서 **Windows 에서는 install 전에 dev 서버를 종료하는 편이 안전합니다.** 켜둔 채 install 하면
  query engine DLL 잠금(EPERM)으로 install 이 중단될 수 있습니다(엔진 바이너리를 교체해야 할 때만 발생).

```bash
pnpm -F @sam/shared build
pnpm -F @sam/api prisma:generate   # DB 스키마 변경까지 반영하려면 prisma:migrate:dev
pnpm -r typecheck                  # 0 errors 확인 후 pnpm dev
```

> Windows 에서 generate 가 `EPERM ... query_engine-windows.dll.node` 로 실패하면 dev 서버가 DLL 을 잠근 것입니다. 종료 후 재시도.

### 자주 만나는 문제

| 증상 | 원인 / 해결 |
|---|---|
| web 콘솔에 `[vite] http proxy error /api/v1/...  ECONNREFUSED` | api 가 안 떴음. `apps/api dev` 로그 확인. 보통 4번 단계(prisma:migrate:dev)를 건너뛴 경우 |
| `@prisma/client` 에서 `TS2305: no exported member 'ScheduleNode' / 'Session'` + `TS7006: Parameter 'tx' implicitly has an 'any' type` 가 한꺼번에 20개 이상 | **Prisma Client 가 생성되지 않은 스텁 상태**(`export declare const PrismaClient: any`). `node_modules` 를 갈아엎은 뒤(pnpm 업그레이드, `pnpm install --force`, `node_modules` 삭제) `.prisma/client` 생성물이 초기화된 것. 에러가 여러 파일에 흩어져 보이지만 원인은 하나. → `pnpm -F @sam/api prisma:generate` (또는 4번 단계 재실행). 아래 "재설치 후" 항목 참고 |
| `prisma generate` 가 `EPERM: operation not permitted, rename '...query_engine-windows.dll.node.tmp'` | 실행 중인 dev 서버가 query engine DLL 을 잠그고 있음(Windows). dev 서버를 먼저 종료한 뒤 generate |
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
