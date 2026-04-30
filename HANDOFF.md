# SAM Scheduler — 세션 이관 문서

> 다음 세션에서 M1 (인증/사용자/세션/감사로그) 을 시작하기 위한 인수인계.
> 이 문서 + [DESIGN.md](./DESIGN.md) + [README.md](./README.md) 만으로 작업 재개가 가능하도록 작성됨.

---

## 0. 즉시 시작용 (Quick Start)

```bash
# 작업 디렉터리
cd D:/workspace/prj/work/sam-scheduler

# 의존성 + 빌드 + DB
pnpm install
pnpm -F @sam/shared build
cp apps/api/.env.example apps/api/.env  # 이미 있다면 생략
pnpm -F @sam/api prisma:migrate:dev

# 개발 서버
pnpm dev
# → http://localhost:5173 (web), http://localhost:3000 (api)
# → 헬스체크: http://localhost:5173/api/v1/health
```

문제 발생 시 → [README.md "자주 만나는 문제"](./README.md#자주-만나는-문제) 표 먼저.

---

## 1. 현재 상태 (M0 완료)

### 동작 확인된 것
- [x] 모노레포(pnpm workspaces) 빌드/실행
- [x] NestJS 10 + Prisma 5.22 + SQLite (WAL) 부팅
- [x] React 18 + Vite 5 + Tailwind 다크모드 토글
- [x] `/api/v1/health` 200 OK (DB ping 포함)
- [x] `/api/v1/health/backup` (백업 디렉터리 상태)
- [x] Vite → API 프록시
- [x] `packages/shared` 의 zod 스키마 양쪽 import

### 아직 안 한 것 (M1 이후)
- 인증/세션/사용자/관리자 모드/감사로그 — **다음 세션에서 진행**
- 프로젝트/멤버/일정 노드 CRUD
- Timeline 뷰
- 백업 자동 cron (운영 컨테이너)
- 오프라인 번들 빌드

---

## 2. 결정 이력 (DESIGN v1.0 §12)

| # | 결정 |
|---|---|
| ① 사용자 규모 | 전체 150명 이하 |
| ② 비밀번호 정책 | 최소 10자 / 영·숫·특 중 3종 / username 포함 금지 |
| ③ 세션 | 슬라이딩 30분 + 절대 만료 12시간 |
| ④ 자동 백업 시각 | 기본 04:00 KST, `BACKUP_CRON` 환경변수 |
| ⑤ 백업 보존 | 30일, `BACKUP_RETENTION_DAYS` 환경변수 |
| ⑥ 초기 ADMIN | 환경변수 1회 시딩 + 첫 로그인 시 패스워드 변경 강제. **단일 ADMIN 운영** — UI 의 사용자 등록은 일반 USER 만 |

기술 스택 확정: **Node 20 + NestJS + Prisma + SQLite + React/Vite/Tailwind + docker compose 오프라인 번들**.

---

## 3. 프로젝트 레이아웃 (M0 시점)

```
sam-scheduler/
├─ DESIGN.md           v1.0 동결
├─ README.md           로컬 개발 + 운영 설치 가이드
├─ HANDOFF.md          ← 이 문서
├─ package.json, pnpm-workspace.yaml, tsconfig.base.json
├─ .editorconfig, .prettierrc, .prettierignore, .gitignore, .nvmrc
│
├─ apps/api/                NestJS + Prisma + SQLite
│   ├─ package.json, tsconfig.json (incremental:false), nest-cli.json
│   ├─ Dockerfile, .env.example, .gitignore
│   ├─ src/main.ts          (helmet, cookie-parser, CORS, prefix /api/v1)
│   ├─ src/app.module.ts
│   ├─ src/prisma/{prisma.module, prisma.service}.ts   (WAL 자동 적용)
│   └─ src/health/{health.module, health.controller}.ts
│   └─ prisma/
│       ├─ schema.prisma    (8 모델: DESIGN §3.2 그대로)
│       ├─ migrations/<ts>_init/
│       └─ data/app.db      (Prisma 가 schema 기준 상대경로 ./data/ 로 생성)
│
├─ apps/web/                React + Vite + Tailwind
│   ├─ package.json, tsconfig.json, tsconfig.node.json
│   ├─ vite.config.ts (proxy /api → :3000), tailwind.config.ts, postcss.config.js
│   ├─ Dockerfile, .env.example, .gitignore
│   ├─ index.html (다크모드 FOUC 방지 inline 스크립트)
│   └─ src/{main.tsx, App.tsx, index.css, lib/theme.ts}
│
├─ packages/shared/         zod
│   ├─ package.json, tsconfig.json
│   └─ src/index.ts         (GlobalRole/ProjectRole/NodeKind/IsoDate/MAX_TREE_DEPTH 등)
│
└─ deploy/                  운영 번들
    ├─ compose.yaml         (api + nginx)
    ├─ nginx.conf           (api 리버스 프록시 + SPA fallback)
    ├─ .env.example
    └─ scripts/{install, full-backup, restore-system, cleanup-old-backups}.sh
```

---

## 4. M0 디버깅 히스토리 (재발 방지용)

다음 세션에서 같은 함정을 피하기 위해 기록:

| # | 증상 | 원인 | 적용된 수정 |
|---|---|---|---|
| 1 | api 부트시 `Cannot find module '@prisma/client'` (간접) → web `ECONNREFUSED` | 처음 `pnpm dev` 만 실행하고 `prisma:migrate:dev` 를 건너뜀 | README 절차에 명시 (1~4 가 5 보다 먼저) |
| 2 | `Cannot find module '...apps/api/dist/main'` | typecheck(noEmit) 가 남긴 `tsconfig.tsbuildinfo` 를 build(emit) 가 공유 → emit 스킵 | `apps/api/tsconfig.json` 에 `"incremental": false` 추가 |
| 3 | `The "class-validator" package is missing. Please, make sure to install it to take advantage of ValidationPipe` | 우리는 zod 사용인데 main.ts 에 NestJS `ValidationPipe` 를 등록 | main.ts 에서 `ValidationPipe` 제거. M1 에서 zod 기반 커스텀 파이프 추가 예정 |
| 4 | `PrismaClientKnownRequestError P2010 — Execute returned results, which is not allowed in SQLite` | `PRAGMA journal_mode=WAL` 은 결과 행을 반환 | `prisma.service.ts` 에서 `$executeRawUnsafe` → `$queryRawUnsafe` |

**환경 메모**: 사용자가 Node v24.15.0 사용 중. 프로젝트 권장은 Node 20 LTS (`engines >=20.10.0`, `.nvmrc` = 20). 현재까지는 동작 — 단 argon2 (네이티브) prebuild 호환성 면에서 Node 20 더 안전. 운영 컨테이너는 `node:20-alpine` 고정.

---

## 5. M1 작업 계획 — 인증 / 사용자 / 세션 / 감사로그

DESIGN §4, §5.1, §5.2, §11(M1 행) 참조.

### 5.1 모듈 구조 (제안)

```
apps/api/src/
├─ auth/
│   ├─ auth.module.ts
│   ├─ auth.controller.ts          POST /auth/login, /logout, /change-password, GET /auth/me
│   ├─ auth.service.ts             argon2 비교, 세션 생성/갱신, 잠금 처리
│   └─ auth.guard.ts               요청에서 sid 쿠키 → 세션 조회 → req.user 주입
│
├─ users/
│   ├─ users.module.ts
│   ├─ users.controller.ts         /admin/users CRUD, /admin/users/{id}/reset-password
│   └─ users.service.ts
│
├─ sessions/
│   ├─ sessions.service.ts         세션 발급/갱신/폐기 (DB 기반, sliding 30분 / abs 12h)
│   └─ session.cleanup.ts          만료 세션 정리 (interval 또는 매 요청 lazy)
│
├─ audit/
│   ├─ audit.module.ts
│   └─ audit.service.ts            log(actorId, action, targetType, targetId, payload)
│
├─ common/
│   ├─ zod-validation.pipe.ts      zod 스키마 + DTO 매핑
│   ├─ password-policy.ts          DESIGN §4.1 정책
│   ├─ csrf.ts                     CSRF 토큰 생성/검증 (상태변경 API)
│   └─ rate-limit.ts               로그인 IP 당 분당 10회
│
└─ bootstrap/
    └─ initial-admin.bootstrap.ts  첫 기동 시 INITIAL_ADMIN_* 1회 시딩 (UNIQUE username 충돌 시 skip)
```

### 5.2 작업 순서 (제안)

1. **세션 인프라**
   - `sessions.service.ts` (sid = `crypto.randomUUID()`, expiresAt = now + 30m, absoluteAt = createdAt + 12h)
   - `auth.guard.ts` (sid 쿠키 → DB 조회 → expired/abs 체크 → 슬라이딩 갱신 → req.user)
   - 비활성 사용자(`is_active=0`) 의 모든 세션 즉시 폐기 헬퍼

2. **로그인/로그아웃**
   - `argon2.verify`
   - 실패 카운터 (메모리 또는 별도 테이블 — DESIGN §4.1: 5회 실패 → 15분 잠금). 메모리는 단일 인스턴스 가정 OK
   - 성공 시 `users.last_login_at` 갱신, `audit_logs` 에 LOGIN_SUCCESS 기록

3. **/auth/me + /auth/change-password**
   - `password_must_change=1` 인 사용자는 `/auth/me` 외 모든 엔드포인트 403 (force-change 인터셉터)

4. **ADMIN 사용자 관리**
   - `POST /admin/users` (단, DESIGN §12-⑥ 에 따라 글로벌 `global_role` 변경은 v1 UI 노출 X — API 만 비공개로 존재)
   - `POST /admin/users/{id}/reset-password` → 임시 비번 평문은 응답 1회만 (서버 비저장)

5. **초기 ADMIN 시딩**
   - `bootstrap/initial-admin.bootstrap.ts` 가 NestJS `OnApplicationBootstrap` 으로 실행
   - `INITIAL_ADMIN_USERNAME` 으로 user 가 없으면 생성 (`global_role='ADMIN'`, `password_must_change=1`, argon2 해시)
   - 운영 시 환경변수에 `INITIAL_ADMIN_PASSWORD` 가 평문으로 들어가는 걸 막기 위해 1회 사용 후 로그에 경고 출력 ("환경에서 제거 권장")

6. **감사로그 + CSRF + Rate limit**
   - 로그인 성공/실패, 관리자 행위, 비활성화 등 감사로그 호출
   - 상태변경 API 에 CSRF 토큰 헤더 검증 (`X-CSRF-Token`, 쿠키와 더블서밋)
   - 로그인 IP 분당 10회 제한 (in-memory LRU)

7. **웹 (apps/web)**
   - `/login` 페이지 (zod + react-hook-form 또는 단순 useState)
   - `/me/password` 변경 페이지
   - 인증 상태 = TanStack Query 의 `useMe()` (401 → /login 리다이렉트)
   - 헤더에 사용자명 + 로그아웃 버튼

### 5.3 새로 필요한 의존성

API:
- `argon2` ✓ 이미 설치
- `cookie-parser` ✓ 이미 설치
- `@nestjs/throttler` (rate limit) — 또는 직접 구현
- `nanoid` 또는 `crypto.randomUUID` (sid)

Web:
- `react-hook-form` + `@hookform/resolvers` (선택)
- 이미 있는 zod, TanStack Query, react-router-dom 으로 충분

### 5.4 결정 필요 (M1 진입 전 확인 권장)

1. **CSRF 전략**: 더블서밋 쿠키 vs `Origin/Referer` 검사. 사내 네트워크라면 후자만으로도 충분할 수 있음.
2. **로그인 실패 잠금 저장 위치**: 프로세스 메모리(단일 인스턴스 전제 OK) vs DB 컬럼(`users.failed_login_count`, `users.locked_until` 추가)
3. **`/admin/users` 의 `global_role` 변경 API 노출 범위**: 완전 비공개 vs CLI 도구로만 vs UI 토글
4. **CSRF 토큰 발급 엔드포인트** (`GET /auth/csrf` 같은 것을 둘지)
5. **세션 만료 cleanup**: 백그라운드 인터벌 vs 매 요청 시 lazy 만료

DESIGN.md §4.1, §4.3, §9 와 정합. 다음 세션에서 위 5개 결정 후 5.2 순서대로 진행하면 됨.

---

## 6. 유용한 명령

```bash
# 빌드
pnpm -F @sam/shared build
pnpm -F @sam/api build
pnpm -F @sam/web build

# 타입체크
pnpm -r typecheck

# Prisma
pnpm -F @sam/api prisma:migrate:dev          # 새 마이그레이션 생성
pnpm -F @sam/api prisma:generate             # 클라이언트만 재생성
pnpm -F @sam/api prisma:studio               # GUI

# DB 리셋 (개발용)
rm -rf apps/api/prisma/data apps/api/prisma/migrations
pnpm -F @sam/api prisma:migrate:dev --name init

# Docker (운영 빌드 검증)
cd deploy && docker compose build
```

---

## 7. 참고 파일

- 설계: [DESIGN.md](./DESIGN.md) — 특히 §3 (모델), §4 (인증/인가), §5 (API), §7 (백업), §11 (로드맵)
- 사용 절차: [README.md](./README.md)
- 스키마: [apps/api/prisma/schema.prisma](./apps/api/prisma/schema.prisma)
- 공유 타입: [packages/shared/src/index.ts](./packages/shared/src/index.ts)
- 운영 .env: [deploy/.env.example](./deploy/.env.example)

---

*M0 종료 시점 — 이 문서 작성 기준 git 상태는 다음 커밋(M0 scaffolding) 이후입니다.*
