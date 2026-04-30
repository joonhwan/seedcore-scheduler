# SAM Scheduler — 세션 이관 문서

> 다음 세션에서 **M2 (프로젝트 / 멤버 / 일정 노드 CRUD)** 를 시작하기 위한 인수인계.
> 이 문서 + [DESIGN.md](./DESIGN.md) + [README.md](./README.md) 만으로 작업 재개가 가능하도록 작성됨.
> 직전 마일스톤(M1 인증) 의 결정/구현 상세는 §6, §7 참조.

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

**로그인 검증**: 처음 부팅하면 `INITIAL_ADMIN_*` 로 ADMIN 1명이 시딩됨. `admin` / `ChangeMe!Now` 로 로그인 → 비밀번호 변경 페이지로 자동 이동 → 변경 후 정상 사용.
> ⚠️ 본 작업 세션에서 `admin` 비밀번호는 검증 중 `NewSecret#9876` 으로 변경됨. 깨끗한 DB 로 시작하려면:
> `rm -rf apps/api/prisma/data apps/api/prisma/migrations && pnpm -F @sam/api prisma:migrate:dev --name init` (단, M1 마이그레이션도 함께 사라짐 — 새로 생성됨)

문제 발생 시 → [README.md "자주 만나는 문제"](./README.md#자주-만나는-문제) 표 + 본 문서 §7.

---

## 1. 현재 상태 (M0 + M1 완료)

### M0 — 모노레포 스캐폴딩 ✓
- pnpm workspaces 빌드/실행
- NestJS 10 + Prisma 5.22 + SQLite (WAL)
- React 18 + Vite 5 + Tailwind 다크모드
- `/api/v1/health` 200 OK (DB ping 포함)
- `/api/v1/health/backup`
- Vite → API 프록시
- `packages/shared` 의 zod 스키마 양쪽 import

### M1 — 인증 / 사용자 / 세션 / 감사로그 ✓ (커밋 `4832827`)
- argon2id 로그인, `cookie sam_sid` (HttpOnly + SameSite=Lax + Path=/api/v1)
- 세션: sliding 30 분, 절대 12 시간, lazy 만료
- 5 회 실패 → 15 분 DB 잠금 (`failed_login_count`, `locked_until` 컬럼)
- 로그인 IP 분당 10 회 in-memory rate limit
- `OriginGuard` (Origin/Referer 검사) — CSRF 토큰 미사용
- `AuthGuard` 전역(`APP_GUARD`), 데코레이터: `@Public`, `@AdminOnly`, `@AllowPasswordChange`
- `password_must_change=1` 인 사용자는 `/auth/{me,change-password,logout}` 외 모두 403
- ADMIN: 사용자 목록/생성/수정/비활성화/리셋/잠금해제, **단일 활성 ADMIN 비활성화 거부**
- 비활성화 시 해당 user 의 모든 세션 즉시 폐기
- 초기 ADMIN 시딩: `INITIAL_ADMIN_*` 1 회 + 환경변수 제거 권장 경고
- `AuditLog` 12 종 (LOGIN_SUCCESS/FAILURE/LOCKED, LOGOUT, PASSWORD_CHANGE, USER_CREATE/UPDATE/ACTIVATE/DEACTIVATE/PASSWORD_RESET/UNLOCK, ADMIN_OVERRIDE_EDIT)
- web: `/login`, `/me/password`, `RequireAuth` 가드, 헤더 사용자명/로그아웃, password-must-change 자동 리다이렉트
- shared: `validatePassword(plain, username)` 단일 정책 소스

### M1 검증된 엔드포인트
```
POST   /api/v1/auth/login              {username, password}
POST   /api/v1/auth/logout
GET    /api/v1/auth/me
POST   /api/v1/auth/change-password    {current, next}

GET    /api/v1/admin/users?query=&status=active|inactive|all
POST   /api/v1/admin/users             {username, displayName, initialPassword}
PATCH  /api/v1/admin/users/:id         {displayName?, isActive?}
POST   /api/v1/admin/users/:id/reset-password   → {temporaryPassword}
POST   /api/v1/admin/users/:id/unlock           → 204 (failed_login_count=0, locked_until=null)
```

### 아직 안 한 것 (M2 이후)
- **프로젝트 / 멤버 / 일정 노드 CRUD** ← 다음 세션
- Timeline 뷰 / 트리 뷰 UI
- 노드 동시성 (`If-Match: <updated_at>`) + 409 Conflict 처리
- 노드 history / comments
- 백업 자동 cron (운영 컨테이너)
- 오프라인 번들 빌드 / restore 흐름

---

## 2. 결정 이력 (DESIGN v1.0 §12 + M1)

### 글로벌 (DESIGN §12)
| # | 결정 |
|---|---|
| ① 사용자 규모 | 전체 150 명 이하 |
| ② 비밀번호 정책 | 최소 10 자 / 영·숫·특 중 3 종 / username 포함 금지 |
| ③ 세션 | 슬라이딩 30 분 + 절대 만료 12 시간 |
| ④ 자동 백업 시각 | 기본 04:00 KST, `BACKUP_CRON` 환경변수 |
| ⑤ 백업 보존 | 30 일, `BACKUP_RETENTION_DAYS` |
| ⑥ 초기 ADMIN | 환경변수 1 회 시딩 + 첫 로그인 패스워드 변경 강제. **단일 ADMIN 운영** — UI 의 사용자 등록은 USER 만 |

### M1 (HANDOFF §5.4 의 5 개 결정 + 사용자 추가)
| # | 항목 | 채택 |
|---|---|---|
| 1 | CSRF 전략 | Origin/Referer 검사 + SameSite=Lax. **더블서밋 토큰 미사용** |
| 2 | 로그인 잠금 저장소 | DB 컬럼 (`users.failed_login_count`, `users.locked_until`) |
| 3 | `global_role` 변경 API | **HTTP 비공개**. 시딩 + DB 직접 조작만. UI/관리자 API 노출 X |
| 4 | CSRF 토큰 엔드포인트 | 미도입 |
| 5 | 만료 세션 cleanup | lazy + 로그인 시 본인 세션 sweep. 백그라운드 인터벌 X |
| ＋ | ADMIN unlock | `POST /admin/users/:id/unlock` → `failed_login_count=0` + `locked_until=null` 동시 리셋 |

기술 스택: **Node 20 + NestJS 10 + Prisma 5.22 + SQLite + React 18 / Vite 5 / Tailwind + docker compose 오프라인 번들**.

---

## 3. 프로젝트 레이아웃 (M1 종료 시점)

```
sam-scheduler/
├─ DESIGN.md           v1.0 동결
├─ README.md           로컬 개발 + 운영 설치 가이드
├─ HANDOFF.md          ← 이 문서
├─ package.json, pnpm-workspace.yaml, tsconfig.base.json (paths 제거됨, §7 참조)
├─ .editorconfig, .prettierrc, .prettierignore, .gitignore, .nvmrc
│
├─ apps/api/                NestJS + Prisma + SQLite
│   ├─ package.json, tsconfig.json (incremental:false), nest-cli.json
│   ├─ Dockerfile, .env.example, .gitignore
│   ├─ src/main.ts          (helmet, cookie-parser, CORS, prefix /api/v1)
│   ├─ src/app.module.ts    (APP_GUARD = AuthGuard 전역)
│   ├─ src/prisma/{prisma.module, prisma.service}.ts   (WAL 자동 적용)
│   ├─ src/health/          @Public()
│   ├─ src/common/          ZodValidationPipe, OriginGuard, RateLimitService, request-context
│   ├─ src/audit/           AuditService (글로벌 모듈)
│   ├─ src/sessions/        SessionsService (글로벌 모듈)
│   ├─ src/auth/            AuthGuard + AuthController + AuthService (login/logout/me/change-password)
│   ├─ src/users/           UsersController + UsersService (ADMIN 사용자 관리)
│   └─ src/bootstrap/       initial-admin.bootstrap.ts (OnApplicationBootstrap)
│   └─ prisma/
│       ├─ schema.prisma    (8 모델 + User 에 failed_login_count, locked_until)
│       └─ migrations/
│           ├─ 20260430123641_initial/
│           └─ 20260430132204_m1_auth_lockout/
│
├─ apps/web/                React + Vite + Tailwind
│   ├─ package.json, tsconfig.json, tsconfig.node.json
│   ├─ vite.config.ts (proxy /api → :3000, commonjsOptions packages/shared 포함 — §7 참조)
│   ├─ src/main.tsx (BrowserRouter + QueryClientProvider)
│   ├─ src/App.tsx (RequireAuth 가드, /login, /me/password, /)
│   ├─ src/lib/{api.ts, auth.ts, theme.ts}
│   └─ src/pages/{LoginPage, ChangePasswordPage}.tsx
│
├─ packages/shared/         zod
│   ├─ package.json (main = dist/index.js, types = dist/index.d.ts)
│   ├─ src/index.ts
│   │   • Enums: GlobalRole, ProjectRole, NodeKind, ProjectStatus, NodeAction, AuditAction
│   │   • Auth DTO: LoginDto, ChangePasswordDto, MeResponse
│   │   • User DTO: CreateUserDto, UpdateUserDto, UserListItem, ResetPasswordResponse, Username
│   │   • 비밀번호 정책: PASSWORD_MIN_LENGTH, validatePassword (서버/클라 공용)
│   │   • 트리: IsoDate, MAX_TREE_DEPTH = 5
│   └─ dist/                (gitignore — `pnpm -F @sam/shared build` 필요)
│
└─ deploy/                  운영 번들 (M0 그대로)
    ├─ compose.yaml, nginx.conf, .env.example
    └─ scripts/{install, full-backup, restore-system, cleanup-old-backups}.sh
```

---

## 4. M2 작업 계획 — 프로젝트 / 멤버 / 일정 노드 CRUD

DESIGN §3 (모델), §4.2 (인가 매트릭스), §5.3–§5.6 (API), §6 (프론트), §11 (M2 행) 참조.

### 4.1 모듈 구조 (제안)

```
apps/api/src/
├─ projects/
│   ├─ projects.module.ts
│   ├─ projects.controller.ts          GET /projects, /admin/projects CRUD/backup/restore
│   └─ projects.service.ts             권한 필터 (자기 멤버 프로젝트만 / ADMIN 모드 시 전체)
│
├─ members/
│   ├─ members.module.ts
│   ├─ members.controller.ts           /projects/:id/members 조회/추가/제거
│   └─ members.service.ts              MANAGER+ 만 변경 가능
│
├─ nodes/
│   ├─ nodes.module.ts
│   ├─ nodes.controller.ts             /projects/:id/nodes, /nodes/:id, /nodes/:id/move
│   ├─ nodes.service.ts                트리 CRUD, 깊이/사이클 검사, sortOrder 재정렬
│   ├─ tree-aggregation.ts             GROUP 의 start_at_effective / end_at_effective 자동 집계
│   ├─ comments.controller.ts          /nodes/:id/comments, /comments/:cid
│   └─ history.controller.ts           /nodes/:id/history (조회만; 기록은 nodes.service 에서)
│
└─ admin-mode/
    └─ admin-mode.guard.ts             요청 헤더 'X-Admin-Mode: 1' 검사 → ADMIN 모드 진입 표식
                                       (감사로그 action='ADMIN_OVERRIDE_EDIT' 으로 기록)
```

### 4.2 작업 순서 (제안)

1. **shared zod DTO 확장**
   - `CreateProjectDto`, `UpdateProjectDto`, `AddMemberDto`, `CreateNodeDto`, `UpdateNodeDto`, `MoveNodeDto`
   - `ProjectListItem`, `NodeTreeItem` (with `startAtEffective`/`endAtEffective`)
   - `ConflictResponse` (server 의 현재 `updatedAt` 동봉)
2. **Projects 기본 CRUD**
   - `GET /projects` — 사용자 가시 프로젝트 (멤버이거나 ADMIN 모드)
   - `POST /admin/projects` — `manager_user_ids[]` 와 함께 생성 (트랜잭션: project + members)
   - `PATCH /admin/projects/:id`, `DELETE /admin/projects/:id` (soft archive 후 영구 삭제 옵션)
3. **Members**
   - `GET /projects/:id/members`
   - `POST /projects/:id/members` (MANAGER+ 또는 ADMIN 모드)
   - `DELETE /projects/:id/members/:userId`
4. **Nodes — 트리 모델**
   - `kind=GROUP|ITEM`, `parentId`, `sortOrder`, `depth`
   - 깊이 ≤ `MAX_TREE_DEPTH`(5), 사이클 검사, 타프로젝트 이동 거부
   - `GROUP` 은 `startAt`/`endAt` 직접 입력 무시 — children 의 min/max 로 effective 집계
   - 모든 변경은 `NodeHistory` 에 diff 기록 (CREATE/UPDATE/MOVE/DELETE/RESTORE)
5. **동시성 (DESIGN §5.6)**
   - 모든 update/move 는 `If-Match: <updatedAt>` 또는 body `expectedUpdatedAt` 검사
   - 불일치 시 409 + 현재 서버 값 반환
6. **댓글 + 히스토리 조회**
   - `GET/POST /nodes/:id/comments`, `DELETE /comments/:cid` (작성자/MANAGER+/ADMIN)
   - `GET /nodes/:id/history`
7. **관리자 모드 UX (DESIGN §4.2.1)**
   - 헤더 `X-Admin-Mode: 1` (또는 쿠키) 로 진입
   - 진입 상태에서의 모든 변경은 `ADMIN_OVERRIDE_EDIT` 감사 추가 기록
   - web: 헤더 토글 버튼 + 띠 배너
8. **web — 프로젝트/노드 화면**
   - `/projects` 목록 + 생성 (ADMIN)
   - `/projects/:id` 트리 뷰 (펼침/접힘, GROUP 색깔 구분, 날짜 칩)
   - 추후 M3 의 timeline 으로 발전

### 4.3 결정 필요 (M2 진입 전 확인 권장)

1. **트리 표현 방식**: 단일 `parent_id` (현재) vs 추가로 `path`/`materialized_path` 컬럼. 자식 다중 조회 시 효율 차이. 본 규모(150 명) 에선 parent_id 만으로도 충분히 빠름 — **권장: parent_id 만 유지**.
2. **`sortOrder` 재정렬 전략**: 정수 step 1 (재정렬 시 일괄 갱신) vs Lexorank/Fractional indexing. **권장: 정수 step 1** (단순). 100 자식 미만 가정.
3. **soft-delete 정책**: `Project.status='ARCHIVED'` 그대로 두고 노드는 cascade 물리 삭제 vs 노드도 soft-delete. **권장: 프로젝트 archive 만 soft, 노드는 즉시 삭제 + history 보존**.
4. **`ADMIN_OVERRIDE_EDIT` 트리거**: 헤더 `X-Admin-Mode: 1` 명시 vs ADMIN 이 비-멤버 프로젝트 편집 시 자동 마킹. **권장: 헤더 명시** (UX 가이드대로 의도 표시).
5. **동시성 토큰 형식**: `If-Match: <ISO8601>` vs body `expectedUpdatedAt` 둘 다 지원할지. **권장: body 만** (캐시 무관, 단순).
6. **노드 생성 시 GROUP 의 dates**: 입력값이 들어와도 무시(서버 강제) vs 400. **권장: 무시 + 응답에서 effective 만 반환**.

DESIGN.md §3.2, §4.2, §5.3–§5.6 와 정합. 다음 세션에서 위 6 개 결정 후 §4.2 순서대로 진행하면 됨.

### 4.4 새로 필요한 의존성
없음 — 이미 있는 zod / TanStack Query / Prisma / cookie 만으로 가능.
선택: `nanoid` 등 ID 생성 라이브러리 (현재 `crypto.randomUUID`).

---

## 5. 유용한 명령

```bash
# 빌드
pnpm -F @sam/shared build
pnpm -F @sam/api build
pnpm -F @sam/web build

# 타입체크
pnpm -r typecheck

# Prisma
pnpm -F @sam/api prisma:migrate:dev          # 새 마이그레이션 생성 (dev DB 잠금 시 dev 서버 종료 필요)
pnpm -F @sam/api prisma:generate
pnpm -F @sam/api prisma:studio

# DB 리셋 (개발용)
rm -rf apps/api/prisma/data apps/api/prisma/migrations
pnpm -F @sam/api prisma:migrate:dev --name init

# Docker (운영 빌드 검증)
cd deploy && docker compose build
```

### M1 스모크 테스트 스크립트 (참고)

```bash
# 1. 로그인
curl -sS -i -c cookies.txt -X POST http://localhost:3000/api/v1/auth/login \
  -H "Origin: http://localhost:5173" -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"ChangeMe!Now"}'

# 2. 비밀번호 변경 (필수)
curl -sS -i -b cookies.txt -X POST http://localhost:3000/api/v1/auth/change-password \
  -H "Origin: http://localhost:5173" -H "Content-Type: application/json" \
  -d '{"current":"ChangeMe!Now","next":"NewSecret#9876"}'

# 3. /me + /admin/users
curl -sS -b cookies.txt http://localhost:3000/api/v1/auth/me
curl -sS -b cookies.txt http://localhost:3000/api/v1/admin/users

# 4. 사용자 생성
curl -sS -b cookies.txt -X POST http://localhost:3000/api/v1/admin/users \
  -H "Origin: http://localhost:5173" -H "Content-Type: application/json" \
  -d '{"username":"alice","displayName":"Alice","initialPassword":"TempPass!2026"}'
```

---

## 6. M1 디버깅 히스토리 (재발 방지용)

| # | 증상 | 원인 | 적용된 수정 |
|---|---|---|---|
| 1 | `prisma migrate dev` 가 `database is locked` 로 실패 | dev 서버(`pnpm dev`) 가 SQLite 핸들 보유 | dev 서버 종료 후 마이그레이션 실행 (README 에 절차 명시 필요) |
| 2 | api 빌드 시 `File '...packages/shared/src/index.ts' is not under 'rootDir'` | `tsconfig.base.json` 의 `paths` 가 워크스페이스 패키지의 src 를 직접 가리킴 | `paths` 제거. `package.json` 의 `main`/`types` 만으로 해석 |
| 3 | `exactOptionalPropertyTypes: true` 충돌 다수 | optional 필드에 `undefined` 명시 안 됨 | 인터페이스를 `T \| undefined` 로 명시 + Prisma `data: { ...(x !== undefined ? {...} : {}) }` 패턴 |
| 4 | web 빌드 시 `"validatePassword" is not exported by "...shared/dist/index.js"` | Vite/Rollup 이 워크스페이스 packages/ 의 CJS 를 자동 변환하지 않음 | `vite.config.ts` 에 `commonjsOptions.include: [/packages\/shared/, /node_modules/]` + `optimizeDeps.include: ['@sam/shared']` |
| 5 | `tsc -b` 가 `apps/web/{vite,tailwind}.config.ts` 옆에 `.js`/`.d.ts` 부산물 emit | `tsconfig.node.json` 이 emit 모드 | `.gitignore` 에 6 개 패턴 추가 (근본 수정은 후속) |
| 6 | `packages/shared/src/index.js` 가 src 에 떨어짐 | `tsc -w` 의 incremental 캐시 또는 outDir 누락 실행 이력 | `.gitignore` 에 `packages/shared/src/*.js{,.map}` 추가 |

**환경 메모**: Node v24.15.0 사용 중. 운영 컨테이너는 `node:20-alpine` 고정.

---

## 7. M1 핵심 코드 위치 (M2 작업 시 참고)

| 관심사 | 파일 |
|---|---|
| 전역 가드 등록 | `apps/api/src/app.module.ts` (`APP_GUARD = AuthGuard`) |
| 인증 데코레이터 | `apps/api/src/auth/auth.guard.ts` (`@Public`, `@AdminOnly`, `@AllowPasswordChange`) |
| CSRF 가드 | `apps/api/src/common/origin.guard.ts` (각 컨트롤러에 `@UseGuards(OriginGuard)` 부착 필수) |
| 요청 컨텍스트 | `apps/api/src/common/request-context.ts` (`AuthenticatedRequest`, `getClientIp`, `getUserAgent`) |
| zod 검증 파이프 | `apps/api/src/common/zod-validation.pipe.ts` |
| 감사 기록 | `apps/api/src/audit/audit.service.ts` — `audit.log({actorId, action, targetType, targetId, ip, userAgent, payload})` |
| 세션 발급/검증 | `apps/api/src/sessions/sessions.service.ts` |
| 비밀번호 정책 | `packages/shared/src/index.ts` 의 `validatePassword` (서버/클라 동일 호출) |
| web fetch 래퍼 | `apps/web/src/lib/api.ts` (`api.get/post/patch/delete`, `ApiError`) |
| web 인증 훅 | `apps/web/src/lib/auth.ts` (`useMe`, `useLogin`, `useLogout`, `useChangePassword`) |

### M2 신규 컨트롤러 작성 체크리스트

```typescript
@Controller('projects')
@UseGuards(OriginGuard)        // ← 상태변경 라우트 있을 때 필수
export class ProjectsController {
  @Get() list(@Req() req: AuthenticatedRequest) { ... }     // 인증 필요(전역) — 별도 데코레이터 불필요

  @Post()
  @AdminOnly()                  // ADMIN 전용 라우트
  @UsePipes(new ZodValidationPipe(CreateProjectDto))
  create(@Body() body: CreateProjectDto, @Req() req: AuthenticatedRequest) { ... }
}
```

---

## 8. 참고 파일

- 설계: [DESIGN.md](./DESIGN.md) — §3 모델, §4 인증/인가, §5 API, §7 백업, §11 로드맵
- 사용 절차: [README.md](./README.md)
- 스키마: [apps/api/prisma/schema.prisma](./apps/api/prisma/schema.prisma)
- 공유 타입: [packages/shared/src/index.ts](./packages/shared/src/index.ts)
- 운영 .env: [deploy/.env.example](./deploy/.env.example)

---

*M1 종료 시점 — 다음 작업은 M2 (프로젝트 / 멤버 / 일정 노드 CRUD).*
*마지막 커밋: `4832827 M1 auth: 세션/사용자/잠금/감사로그 + 로그인 화면`.*
