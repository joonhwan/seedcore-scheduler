# SAM Scheduler — 세션 이관 문서

> 다음 세션에서 **M2c (웹 프론트엔드 — 프로젝트 목록 + 트리 뷰)** 를 시작하기 위한 인수인계.
> 이 문서 + [DESIGN.md](./DESIGN.md) + [README.md](./README.md) 만으로 작업 재개가 가능하도록 작성됨.
> 직전 마일스톤(M1 인증, M2a 프로젝트/멤버/관리자모드, M2b 노드 트리 백엔드) 의 결정/구현 상세는 §6, §7, §8 참조.

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

## 1. 현재 상태 (M0 + M1 + M2a + M2b 완료)

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

### M2a — 프로젝트 / 멤버 / 관리자 모드 ✓ (2026-04-30)
- shared: `AuditAction` 에 PROJECT_*/MEMBER_*/NODE_* 추가 + `CreateProjectDto`, `UpdateProjectDto`, `ProjectListItem`, `ProjectDetail`, `AddMemberDto`, `ProjectMemberItem`, `CreateNodeDto`, `UpdateNodeDto`, `MoveNodeDto`, `NodeTreeItem`, `ConflictResponse`
- `apps/api/src/projects/` — `ProjectsService` 가시성 필터 (ADMIN+adminMode → 전체, 그 외 → 멤버 프로젝트), `ProjectsController` (`GET /projects`, `GET /projects/:id`, `POST/PATCH/DELETE /admin/projects[/...]`)
- `apps/api/src/members/` — `GET/POST /projects/:id/members`, `DELETE /projects/:id/members/:userId`. 마지막 MANAGER 제거 거부.
- **AdminMode = 컨텍스트 주입**(차단 X). `AuthGuard` 가 ADMIN 사용자 + `X-Admin-Mode: 1` 헤더일 때만 `req.adminMode=true` 채움. non-ADMIN 의 헤더는 silently 무시.
- 동시성: `expectedUpdatedAt` body 필드 검사 → 불일치 시 `409 { code:'CONFLICT', currentUpdatedAt }`.
- DELETE 의미: hard delete 는 `status='ARCHIVED'` 일 때만. ACTIVE 면 `409 NOT_ARCHIVED` ("PATCH status=ARCHIVED 후 삭제하라"). PATCH 로 archive/restore 토글.
- 모든 state-changing 라우트에 `@UseGuards(OriginGuard)`. ADMIN 모드 변경은 `ADMIN_OVERRIDE_EDIT` 별도 감사.
- 검증된 엔드포인트:
  ```
  GET    /api/v1/projects                                     # 가시성 필터
  GET    /api/v1/projects/:id
  POST   /api/v1/admin/projects        {name, description?, managerUserIds[]}
  PATCH  /api/v1/admin/projects/:id    {name?, description?, status?, expectedUpdatedAt}
  DELETE /api/v1/admin/projects/:id    # ARCHIVED 만 hard delete
  GET    /api/v1/projects/:id/members
  POST   /api/v1/projects/:id/members  {userId, role}
  DELETE /api/v1/projects/:id/members/:userId
  ```

### M2b — 일정 노드 트리 백엔드 ✓ (2026-04-30)
- shared: `CreateCommentDto`, `NodeCommentItem`, `NodeHistoryItem` 추가
- schema: `NodeHistory.nodeId` nullable + `onDelete=SetNull`, `nodeIdSnapshot` / `projectIdSnapshot` 컬럼 추가 (마이그레이션 `20260430211000_m2b_node_history_snapshot`)
- `apps/api/src/nodes/nodes.service.ts` — 트리 CRUD (사이클·깊이≤4·타프로젝트 검증, sortOrder repack 양방향, depth 자손 일괄 갱신)
- `apps/api/src/nodes/tree-aggregation.ts` — GROUP `startAtEffective`/`endAtEffective` post-order DFS 집계 (DESIGN §3.4 옵션 1)
- `apps/api/src/nodes/comments.service.ts` — 댓글 CRUD (작성자/MANAGER+/ADMIN 모드 삭제 권한)
- `apps/api/src/nodes/history.service.ts` — `nodeIdSnapshot` 으로 조회. 노드 삭제 후에도 history 보존 검증 완료. `take: 200` 제한
- 권한: 노드/댓글 CRUD 는 멤버(MANAGER 또는 MEMBER) OR ADMIN+adminMode (DESIGN §4.2 매트릭스)
- 동시성: body `expectedUpdatedAt` → 409 `{code:'CONFLICT', currentUpdatedAt}` (Projects 패턴 동일)
- 감사로그: NODE_CREATE/UPDATE/MOVE/DELETE + adminMode 일 때 `ADMIN_OVERRIDE_EDIT` (`payload.sub`)

### M2b 검증된 엔드포인트
```
GET    /api/v1/projects/:projectId/nodes        # 트리 배열, GROUP 에 effective 동봉
POST   /api/v1/projects/:projectId/nodes        {kind, parentId?, title, description?, startAt?, endAt?}
PATCH  /api/v1/nodes/:id                        {title?, description?, startAt?, endAt?, expectedUpdatedAt}
POST   /api/v1/nodes/:id/move                   {newParentId, newSortOrder, expectedUpdatedAt}
DELETE /api/v1/nodes/:id                        # 자손 cascade + sortOrder 형제 당김

GET    /api/v1/nodes/:nodeId/comments
POST   /api/v1/nodes/:nodeId/comments           {body}
DELETE /api/v1/comments/:cid                    # 작성자/MANAGER+/ADMIN+adminMode

GET    /api/v1/nodes/:id/history                # nodeIdSnapshot 조회, 삭제 후에도 유효
```

### 아직 안 한 것 (M2c 이후)
- **web — 프로젝트 목록 / 생성 / 멤버 화면** (관리자 모드 토글 + 띠 배너) — 다음 세션
- web — 트리 뷰 + 노드 폼 + 댓글/이력 패널
- Timeline 뷰 (M3+)
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
│   ├─ src/projects/        ProjectsController + ProjectsService (M2a)
│   ├─ src/members/         MembersController + MembersService (M2a)
│   ├─ src/nodes/           NodesController/Service + tree-aggregation + Comments + History (M2b)
│   └─ src/bootstrap/       initial-admin.bootstrap.ts (OnApplicationBootstrap)
│   └─ prisma/
│       ├─ schema.prisma    (8 모델 + User 에 failed_login_count, locked_until + NodeHistory 스냅샷 컬럼)
│       └─ migrations/
│           ├─ 20260430123641_initial/
│           ├─ 20260430132204_m1_auth_lockout/
│           └─ 20260430211000_m2b_node_history_snapshot/
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

## 4. M2c 작업 계획 — 웹 프론트엔드 (프로젝트 목록 + 트리 뷰)

DESIGN §6 (프론트엔드 설계), 부록 A (와이어프레임) 참조. 백엔드 API 는 §1 의 검증된 엔드포인트가 모두 준비됨.

### 4.0 M2c 진입 결정 (제안 — 첫 세션에서 확정 필요)

| # | 항목 | 후보 |
|---|---|---|
| 1 | 트리 라이브러리 | (a) 직접 구현 (분기 200건/깊이 5) (b) react-arborist 등 |
| 2 | drag&drop 이동 | (a) HTML5 native (b) dnd-kit (c) v1 미지원 (좌측 메뉴/단축키만) |
| 3 | 동시성 충돌 UX | 409 발생 시 (a) 변경분 비교 모달 (b) "다시 불러오기" 토스트 |
| 4 | 관리자 모드 활성화 | (a) 헤더 토글 (b) `/admin` 영역 진입 |

### 4.1 화면/라우팅 (DESIGN §6.1, A.1)

```
/                            → 프로젝트 카드 목록 (내가 멤버 / 관리자 모드 시 전체)
/projects/new                → ADMIN 전용 (관리자 모드 진입 후 노출)
/projects/:id                → Tree+Table 메인 화면 (좌 트리, 우 상세 패널)
/projects/:id/members        → 멤버 관리 (MANAGER+/ADMIN 모드)
/projects/:id/nodes/:nodeId  → URL 로 노드 직접 진입
/me/password                 → 기존
/login                       → 기존
```

### 4.2 작업 순서 (제안)

1. **프로젝트 목록 + 생성 화면**
   - `/` — `useQuery('/projects')` 카드 그리드. 카드: 이름, 상태 뱃지, memberCount, myRole.
   - 헤더에 ADMIN 사용자에게만 "관리자 모드" 토글 → API 호출에 `X-Admin-Mode: 1` 헤더 자동 부착. ON 일 때 상단에 띠 배너 표시.
   - 관리자 모드 ON → "새 프로젝트" 버튼 노출 (ADMIN 전용).
2. **프로젝트 상세 + 트리 뷰**
   - 좌: 트리 (GROUP/ITEM 인디케이터, sortOrder 화살표, +자식/+형제 버튼).
   - 우: 노드 상세 폼 (title, description, ITEM 만 startAt/endAt). GROUP 은 effective 만 read-only.
   - 변경 시 `expectedUpdatedAt` 동봉. 409 → "다시 불러오기" 토스트.
   - 댓글 패널 + 이력 패널.
3. **멤버 관리**
   - MANAGER+/ADMIN 모드 사용자에게만 노출. 사용자 검색 → role 선택 → 추가/제거.
4. **에러/로딩 표준화**
   - `api.ts` 의 `ApiError` 매핑: 401 → /login, 409 → "변경 충돌" 토스트, 403 → 안내, 5xx → 일반 오류.

### 4.3 권장 사전 작업

- shared 의 zod 스키마는 web 에서도 그대로 import 해 폼 검증에 사용 (LoginPage 패턴).
- `useQuery` 키 컨벤션: `['projects']`, `['projects', id]`, `['projects', id, 'members']`, `['projects', id, 'nodes']`, `['nodes', id, 'comments']`.
- 트리 데이터: 백엔드는 평면 배열 반환. 클라이언트에서 parentId 로 트리 구성 (5,000건 이내라 단순 reduce 로 충분).

### 4.4 새로 필요한 의존성
- 트리/D&D 결정에 따라 (선택). 기본은 0개.

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

## 8. M2b 핵심 코드 위치 + 결정

| 관심사 | 파일 |
|---|---|
| 노드 트리 CRUD/move | `apps/api/src/nodes/nodes.service.ts` (사이클·depth·sortOrder repack) |
| GROUP effective 집계 | `apps/api/src/nodes/tree-aggregation.ts` (`buildTreeItems`, post-order DFS) |
| 댓글 | `apps/api/src/nodes/comments.service.ts` (작성자/MANAGER+/ADMIN+adminMode 삭제) |
| 이력 조회 | `apps/api/src/nodes/history.service.ts` (`nodeIdSnapshot` 으로 조회, take=200) |
| 라우팅 | `apps/api/src/nodes/{nodes,comments,history}.controller.ts` |

### 8.1 M2b 결정 (advisor 검증 후 확정)

| # | 항목 | 채택 |
|---|---|---|
| 1 | depth 검증 | `< MAX_TREE_DEPTH (=5)` — 깊이 0..4 허용. create/move 둘 다 동일 |
| 2 | NodeHistory 보존 | `nodeId` nullable + `onDelete=SetNull` + `nodeIdSnapshot` (NOT NULL) + `projectIdSnapshot` (NOT NULL). `diffJson` 에 모든 필드 스냅샷 |
| 3 | DELETE 의 history | 자손 각각에 대해 DELETE 행 기록 후 leaf-first 직접 삭제. 같은 부모의 후속 형제 sortOrder 당김 |
| 4 | sortOrder | 1-based, dense (step 1). create 시 자동 할당 (`max+1`). move 시 양쪽 부모 모두 repack |
| 5 | newSortOrder clamp | `Math.min(newSortOrder, siblingCount+1)` — 너무 큰 값은 끝으로 |
| 6 | UPDATE 의 GROUP startAt/endAt | `BadRequestException({error:'GROUP_DATES_NOT_EDITABLE'})` (입력 자체 거부). create 시엔 silently 무시 (=null 강제) |
| 7 | 빈 UPDATE | 변경 필드 0 → history/audit 기록 없이 현재 노드 그대로 반환 |
| 8 | history take 한계 | 200건 (페이지네이션은 v1.x 이후) |
| 9 | Prisma data 타입 | scalar FK + 관계 혼합 시 `Prisma.ScheduleNodeUncheckedUpdateInput` 사용 (`updatedById: ctx.actorId` 직접) |

---

## 9. 참고 파일

- 설계: [DESIGN.md](./DESIGN.md) — §3 모델, §4 인증/인가, §5 API, §7 백업, §11 로드맵
- 사용 절차: [README.md](./README.md)
- 스키마: [apps/api/prisma/schema.prisma](./apps/api/prisma/schema.prisma)
- 공유 타입: [packages/shared/src/index.ts](./packages/shared/src/index.ts)
- 운영 .env: [deploy/.env.example](./deploy/.env.example)

---

*M2b 종료 시점 — 다음 작업은 M2c (웹 프론트엔드: 프로젝트 목록 + 트리 뷰).*
*마지막 커밋: 후속 — 본 갱신 시점.*
