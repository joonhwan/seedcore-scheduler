# SAM Scheduler — 세션 이관 문서

> 다음 세션에서 **M3 (Timeline 뷰 / 운영 자동화)** 를 시작하기 위한 인수인계.
> 이 문서 + [DESIGN.md](./DESIGN.md) + [README.md](./README.md) 만으로 작업 재개가 가능하도록 작성됨.
> 직전 마일스톤(M1 인증, M2a 프로젝트/멤버/관리자모드, M2b 노드 트리 백엔드, M2c 웹 프론트엔드) 의 결정/구현 상세는 §6, §7, §8, §9 참조.

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

## 1. 현재 상태 (M0 + M1 + M2a + M2b + M2c 완료)

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

### M2c — 웹 프론트엔드 (프로젝트 / 트리 / 댓글 / 이력 / 멤버) ✓ (2026-05-01)
- **AdminMode 컨텍스트** (`apps/web/src/lib/adminMode.ts`) — `useSyncExternalStore` 모듈 store + localStorage 영속. 토글 시 `qc.invalidateQueries()` 전체 무효화. `api.ts` 의 `request()` 가 모든 요청에 자동 `X-Admin-Mode: 1` 부착.
- **공통 UI**: `lib/toast.ts` (외부 store + `<ToastViewport>`), `lib/errors.ts` (`apiErrorMessage` — CONFLICT/CYCLE/MAX_DEPTH/GROUP_DATES_NOT_EDITABLE/LAST_MANAGER 등 매핑), `api.ts` 401 글로벌 핸들러 (`/auth/me` 제외 → me 캐시 null 처리 → `RequireAuth` 가 /login 리다이렉트)
- **헤더**: ADMIN 사용자에게만 "관리자 모드" 토글 노출. ON 시 상단 띠 배너 + 토글 OFF 즉시 모든 쿼리 재요청. theme store 도 같은 패턴으로 정리(이전 per-hook state 버그 fix)
- **라우트**: `/`, `/projects/new`, `/projects/:id`, `/projects/:id/members`
- **프로젝트 목록 (`ProjectsPage`)**: 카드 그리드(이름·상태·myRole·memberCount). ADMIN+adminMode 만 "+ 새 프로젝트" 노출
- **프로젝트 생성 (`ProjectNewPage`)**: zod safeParse + 사용자 검색 체크박스 (≥1 MANAGER 필수)
- **프로젝트 상세 (`ProjectDetailPage`)**:
  - 헤더: 보관/복원 (MANAGER+/ADMIN+adminMode), 영구 삭제 (ADMIN+adminMode + ARCHIVED 만), 멤버 관리 링크
  - 좌측 트리 (`NodeTree`): GROUP/ITEM 인디케이터, 일자 표시, 호버 시 `↑↓ +자 +형 ⇄ ✕` 버튼. 깊이 4 ITEM 의 +자 비활성. 클램프 sortOrder
  - 우측 패널: kind-aware `NodeDetail` (ITEM 만 startAt/endAt 입력, GROUP 은 effective read-only) + `NodeCommentsPanel` + `NodeHistoryPanel`
  - 모달: `NodeFormDialog` (kind 라디오 + 조건부 일자), `ParentPickerDialog` (트리 picker, 사이클/깊이 사전체크)
- **댓글 패널**: 권한별 작성/삭제 (작성자/MANAGER+/ADMIN+adminMode) — 백엔드 검증 동일
- **이력 패널**: `{from, to}` diff 렌더 (CREATE 는 `to` 만), MOVE/UPDATE 는 from→to. 200건 한계 노출. 노드 update/move 시 history 자동 invalidate
- **멤버 관리 (`ProjectMembersPage`)**: 현재 멤버 목록 + 사용자 검색·MEMBER/MANAGER 셀렉트·추가 버튼. LAST_MANAGER 거부 → 토스트
- **검증**: typecheck (api+web+shared) 통과, web build 통과, dev 서버 + Playwright smoke 핵심 동선 확인 (login→adminMode→트리 CRUD→GROUP effective→댓글→history→멤버 LAST_MANAGER 토스트)

### M2c 진입 결정 (실제 채택)
| # | 항목 | 채택 |
|---|---|---|
| 1 | 트리 라이브러리 | (a) **직접 구현** — `components/NodeTree.tsx` recursive |
| 2 | drag&drop 이동 | (c) **v1 미지원** + ↑↓ 버튼 + ⇄ "부모 변경" 모달 (advisor 권고로 추가) |
| 3 | 동시성 충돌 UX | (b) **토스트** — `apiErrorMessage` 의 CONFLICT 매핑 |
| 4 | 관리자 모드 진입 | (a) **헤더 토글** + 띠 배너 |

### M2c 알려진 caveat (v1 의도)
- adminMode 토글 OFF 중 비멤버 프로젝트 페이지에 머무르면 다음 refetch 가 403 → 페이지가 토스트만 표시 (자동 / 리다이렉트는 안 함). MVP 의도. 필요 시 `apiErrorMessage` 옆에 글로벌 403 핸들러 추가
- 트리 dnd 미지원. 부모 변경은 ⇄ 버튼 모달
- 이력 페이지네이션 미지원 (200건 take)

### 아직 안 한 것 (M3 이후)
- Timeline 뷰 / 캘린더 뷰 (DESIGN §6.4)
- 백업 자동 cron (운영 컨테이너)
- 오프라인 번들 빌드 / restore 흐름
- 사용자 관리 화면 (`/admin/users`) — 백엔드는 M1 에서 준비됨, web UI 만 미구현

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

## 4. M3 작업 계획 — Timeline 뷰 / 운영 자동화

DESIGN §6.4 (Timeline 뷰), §7 (백업/복원), §11 (로드맵) 참조.

### 4.0 M3 진입 결정 (다음 세션에서 확정 필요)

| # | 항목 | 후보 |
|---|---|---|
| 1 | Timeline 라이브러리 | (a) 직접 SVG/CSS grid (b) `vis-timeline` (c) `react-gantt-task` 등 |
| 2 | Timeline 뷰의 상태 변경 | (a) 읽기 전용 (b) 드래그로 일자 조정 (UPDATE 호출) |
| 3 | 백업 자동화 | (a) 컨테이너 cron (host crontab + bash) (b) NestJS 스케줄러 (c) 둘 다 |
| 4 | 사용자 관리 web UI | (a) M3 에 포함 (b) 별도 마일스톤 |

### 4.1 후속 작업 후보

1. **Timeline 뷰 (`/projects/:id` 의 추가 탭)**
   - 평면 NodeTreeItem[] → 일자별로 정렬한 간트 형태
   - GROUP 은 effective 범위로 막대 (자식 ITEM 합)
   - ITEM 은 startAt..endAt 막대
   - 좌측 노드 라벨 + 상단 일자 헤더
2. **사용자 관리 web UI** (백엔드 M1 준비 완료):
   - `/admin/users` — 목록, 생성, displayName/active 토글, 비밀번호 리셋(임시 비번 토스트), 잠금 해제
3. **백업 자동화**:
   - `deploy/scripts/full-backup.sh` 가 이미 존재. 스케줄링 + 보존(`BACKUP_RETENTION_DAYS`) 자동화
4. **오프라인 번들 / restore 흐름** (DESIGN §10): docker save + scripts 정리

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

## 9. M2c 핵심 코드 위치 + 결정

| 관심사 | 파일 |
|---|---|
| AdminMode store | `apps/web/src/lib/adminMode.ts` (`useAdminMode`, 토글 시 `qc.invalidateQueries()`) |
| 외부 store 패턴 | `apps/web/src/lib/store.ts` (`createStore` + `useStore` = `useSyncExternalStore`) |
| api 헤더 자동 부착 | `apps/web/src/lib/api.ts` (`request()` 가 `isAdminModeOn()` 검사 → `X-Admin-Mode: 1`) |
| 401 글로벌 핸들러 | `apps/web/src/main.tsx` (`configureApi({onUnauthorized})` → me 캐시 null) |
| 토스트 | `apps/web/src/lib/toast.ts` + `apps/web/src/components/ToastViewport.tsx` |
| ApiError 매핑 | `apps/web/src/lib/errors.ts` (`apiErrorMessage`, KNOWN 사전) |
| 도메인 hooks | `apps/web/src/lib/{projects,nodes,members,users,comments,history}.ts` |
| 트리 컴포넌트 | `apps/web/src/components/NodeTree.tsx` (`buildTree`, `maxDescendantDepth`) |
| 노드 상세 폼 | `apps/web/src/components/NodeDetail.tsx` (kind-aware) |
| 노드 생성 모달 | `apps/web/src/components/NodeFormDialog.tsx` |
| 부모 변경 모달 | `apps/web/src/components/ParentPickerDialog.tsx` (사이클·깊이 사전체크) |
| 댓글 패널 | `apps/web/src/components/NodeCommentsPanel.tsx` |
| 이력 패널 | `apps/web/src/components/NodeHistoryPanel.tsx` (CREATE 는 `to`, UPDATE/MOVE 는 from→to) |
| 페이지 | `apps/web/src/pages/{ProjectsPage, ProjectNewPage, ProjectDetailPage, ProjectMembersPage}.tsx` |

### 9.1 M2c 결정 (advisor 검증 후 확정)

| # | 항목 | 채택 |
|---|---|---|
| 1 | adminMode + 캐시 전략 | 토글 시 `qc.invalidateQueries()` 전체 무효화. queryKey 에 adminMode 포함하지 않음 (150유저 스코프, 단순) |
| 2 | 트리 라이브러리 | 직접 구현. 5,000건 이내 + reduce 로 build, 재귀 컴포넌트로 렌더 |
| 3 | drag&drop | v1 미지원. ↑↓ 같은-부모 reorder + ⇄ 부모변경 모달 |
| 4 | 부모변경 사전검증 | 사이클(자기/자손)·깊이(`newParent.depth + 1 + (subtreeMax - oldDepth) < 5`)·current parent 동일 모두 클라이언트 사전체크 + 백엔드 재검증 |
| 5 | 트리 +자 비활성 | `node.depth + 1 >= MAX_TREE_DEPTH` 시 disabled (4단 ITEM) |
| 6 | GROUP 폼 | startAt/endAt 입력 X — `startAtEffective`/`endAtEffective` read-only. ITEM 만 date input 노출 |
| 7 | 동시성 충돌 UX | "다시 불러오기" 토스트 (변경분 비교 모달은 v1.x 이후) |
| 8 | adminMode 토글 OFF caveat | 비멤버 프로젝트 페이지에 머무르면 다음 refetch 가 403 → 토스트만. 자동 리다이렉트 안 함 (의도) |
| 9 | useUpdateNode/useMoveNode | 노드/프로젝트 invalidate + 영향 노드 history invalidate (`['nodes', id, 'history']`) |
| 10 | useTheme 패턴 정리 | 동일 외부 store 패턴으로 교체 (이전 per-hook state 버그 fix) |

---

## 10. 참고 파일

- 설계: [DESIGN.md](./DESIGN.md) — §3 모델, §4 인증/인가, §5 API, §7 백업, §11 로드맵
- 사용 절차: [README.md](./README.md)
- 스키마: [apps/api/prisma/schema.prisma](./apps/api/prisma/schema.prisma)
- 공유 타입: [packages/shared/src/index.ts](./packages/shared/src/index.ts)
- 운영 .env: [deploy/.env.example](./deploy/.env.example)

---

*M2c 종료 시점 — 다음 작업은 M3 (Timeline 뷰 / 운영 자동화 / 사용자 관리 UI 등).*
*마지막 커밋: 후속 — 본 갱신 시점.*
