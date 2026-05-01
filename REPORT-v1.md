# SAM Scheduler — v1 개발 진행 보고

> **상태**: M0 + M1 + M2(a/b/c) + M3(a/b/c/d) 완료 (12 커밋, 약 1.5일 작업 — 2026-04-30 ~ 2026-05-01)
> **다음 단계**: 오프라인 번들 + 운영 검증 (M4 = v1 출시 가능 상태)

---

## 1. 한 줄 요약

설계서(DESIGN.md v1.0) 기준 **백엔드 도메인 / 인증·인가 / 웹 프론트엔드 / 운영 자동화 + 사용자 관리 UI + 진행율 + Timeline 뷰** 까지 완성. 남은 것은 **오프라인 배포 패키징 + 운영 가이드** 폴리시.

---

## 2. 코드베이스 스냅샷

| 항목 | 값 |
|---|---|
| 커밋 수 | **12** (initial 포함) |
| API (NestJS) 코드 | `apps/api/src/**/*.ts` ≈ **3,446 라인** |
| Web (React) 코드 | `apps/web/src/**/*.{ts,tsx}` ≈ **3,866 라인** |
| Shared DTO (zod) | `packages/shared/src/index.ts` ≈ **322 라인** |
| API 라우트 (`@Get/@Post/@Patch/@Delete`) | **29 개** |
| Prisma 마이그레이션 | **4 개** (initial / m1_auth_lockout / m2b_node_history_snapshot / m3_node_progress) |
| 웹 번들 사이즈 | JS 354 KB / CSS 24 KB (gzip 102 / 5 KB) |

기술 스택: **Node 20 + NestJS 10 + Prisma 5.22 + SQLite (WAL) + React 18 + Vite 5 + Tailwind + pnpm workspaces**.

---

## 3. 마일스톤별 완료 사항

### M0 — 모노레포 스캐폴딩 ✓
- pnpm workspaces 빌드/실행
- NestJS 10 + Prisma + SQLite (WAL + foreign_keys + synchronous=NORMAL)
- React 18 + Vite 5 + Tailwind 다크모드
- `/api/v1/health` (DB ping), `/api/v1/health/backup`
- Vite → API 프록시
- `packages/shared` 의 zod 스키마 양쪽 import

### M1 — 인증 / 사용자 / 세션 / 감사로그 ✓
- argon2id 로그인, 쿠키 `sam_sid` (HttpOnly + SameSite=Lax + Path=/api/v1)
- 세션: 슬라이딩 30분, 절대 12시간, lazy 만료
- 5회 실패 → 15분 DB 잠금 (`failed_login_count`, `locked_until`)
- 로그인 IP 분당 10회 in-memory rate limit
- `OriginGuard` (Origin/Referer 검사) — CSRF 토큰 미사용
- `AuthGuard` 전역(`APP_GUARD`), 데코레이터: `@Public`, `@AdminOnly`, `@AllowPasswordChange`
- `password_must_change=1` 인 사용자는 `/auth/{me,change-password,logout}` 외 모두 403
- ADMIN 사용자 관리: 생성/수정/비활성화/리셋/잠금해제 + 단일 활성 ADMIN 비활성화 거부
- 비활성화 시 해당 user 의 모든 세션 즉시 폐기
- 초기 ADMIN 시딩 (`INITIAL_ADMIN_*`, 1회 + 첫 로그인 비번 변경 강제)
- `AuditLog` 24 액션 (LOGIN_*/LOGOUT/PASSWORD_CHANGE/USER_*/ADMIN_OVERRIDE_EDIT/PROJECT_*/MEMBER_*/NODE_*)

### M2a — 프로젝트 / 멤버 / 관리자 모드 ✓
- `ProjectsService`: 가시성 필터 (ADMIN+adminMode → 전체, 그 외 → 멤버 프로젝트)
- 프로젝트 CRUD + 멤버 추가/제외 (마지막 MANAGER 제거 거부)
- **AdminMode = 컨텍스트 주입** (차단 X). `AuthGuard` 가 ADMIN + `X-Admin-Mode: 1` 헤더일 때만 `req.adminMode=true` 채움
- 동시성: `expectedUpdatedAt` 검사 → 불일치 시 `409 { code:'CONFLICT', currentUpdatedAt }`
- DELETE 의미: hard delete 는 `status='ARCHIVED'` 일 때만. ACTIVE 면 `409 NOT_ARCHIVED`
- 모든 상태변경 라우트에 `OriginGuard`. ADMIN 모드 변경은 `ADMIN_OVERRIDE_EDIT` 별도 감사

### M2b — 일정 노드 트리 백엔드 ✓
- `ScheduleNode` 트리 CRUD: 사이클 검증, 깊이 ≤ 5, 타프로젝트 이동 차단, sortOrder repack 양방향, depth 자손 일괄 갱신
- `tree-aggregation.ts`: GROUP `startAtEffective`/`endAtEffective` post-order DFS 집계 (DESIGN §3.4 옵션 1)
- 댓글 CRUD (작성자/MANAGER+/ADMIN 모드 삭제)
- 이력 조회: `nodeIdSnapshot` 으로 조회 → 노드 삭제 후에도 history 보존. `take: 200`
- `NodeHistory.nodeId` nullable + `onDelete=SetNull` + `nodeIdSnapshot`/`projectIdSnapshot` (NOT NULL)
- 권한: 노드/댓글 CRUD 는 멤버(MANAGER 또는 MEMBER) OR ADMIN+adminMode

### M2c — 웹 프론트엔드 (프로젝트 / 트리 / 댓글 / 이력 / 멤버) ✓
- AdminMode 컨텍스트 (`useSyncExternalStore` 외부 store + localStorage 영속)
- 토글 시 `qc.invalidateQueries()` 전체 무효화. `api.ts` `request()` 가 모든 요청에 자동 `X-Admin-Mode: 1` 부착
- `lib/toast` (외부 store), `lib/errors` (`apiErrorMessage` + KNOWN 사전), `api.ts` 401 글로벌 핸들러
- 헤더: ADMIN 한정 "관리자 모드" 토글 + 띠 배너
- 라우트: `/`, `/projects/new`, `/projects/:id`, `/projects/:id/members`
- 프로젝트 목록 / 생성 / 상세 (좌측 트리 + 우측 NodeDetail/Comments/History)
- 트리: `NodeTree` 직접 구현 (재귀 컴포넌트 + indent + ↑↓ +자 +형 ⇄ ✕ 호버 버튼)
- 부모 변경 모달 (`ParentPickerDialog`): 사이클 / 깊이 사전체크
- 멤버 관리 페이지 + LAST_MANAGER 거부 토스트

### M3a — 사용자 관리 web UI ✓
- `/admin/users` 라우트 + 헤더에 ADMIN 한정 링크 (adminMode 와 무관, `globalRole === 'ADMIN'` 만으로 가드)
- `AdminUsersPage`: 검색·상태 필터 (기본 "전체"), 행 인라인 displayName 편집, 비활성/잠금/비번변경필요 배지, 자기자신 비활성화 disabled
- `UserCreateDialog`: zod safeParse + `validatePassword` 사전체크 → USER 권한으로만 생성, `passwordMustChange=true`
- `TempPasswordDialog`: 비번 리셋 후 1회성 표시 + 복사 버튼. 캐시/URL 미저장
- `lib/users`: `useCreateUser/useUpdateUser/useResetPassword/useUnlockUser` mutation

### M3b — 백업 자동화 (NestJS 스케줄러) ✓
- `@nestjs/schedule@^6.1.3` + `cron@^4.x` 의존성 추가
- `SchedulerRegistry.addCronJob` 동적 등록 (TZ='Asia/Seoul' 하드코드)
- `BACKUP_DB_PATH` 별도 env (Prisma DATABASE_URL 파싱 회피). dev portable 기본값
- VACUUM INTO 인라인 path (parameter 미지원 → `'` escape) → tmp → gzip(level 9) → `BACKUP_DIR/YYYYMMDD/app.db.gz` + `.sha256` sidecar
- `isRunning` 게이트 (cron + manual 공통, overlap 방지 검증 완료)
- `BACKUP_RETENTION_DAYS` 초과 디렉토리 자동 정리 (mtime 기준)
- `POST /admin/health/backup/run` (ADMIN+OriginGuard, 동기 응답)
- `GET /health/backup` 디렉토리 스캔 그대로
- `node:crypto` sha256 (sha256sum 셸 미사용 — air-gap 친화)
- `deploy/scripts/*.sh` 는 수동 fallback

### M3c — 진행율(%) 도메인 + Tree 뷰 통합 ✓
- `ScheduleNode.progress` (Int 0..100, default 0) — 마이그레이션 `m3_node_progress` + CHECK 제약 (Prisma raw SQL 패치)
- shared: `Progress = z.number().int().min(0).max(100)`. `Create/UpdateNodeDto` + `NodeTreeItem` 에 `progress` + `progressEffective`
- 집계: **자손 ITEM 단순평균(반올림)**. GROUP-only 자손은 sum/count 캐리로 평탄화. 자손 ITEM 0개면 `null`
- GROUP 의 progress 직접 입력 거부 (`GROUP_PROGRESS_NOT_EDITABLE`). create 시엔 silent ignore (대칭성)
- `NodeDetail`: ITEM = 슬라이더(step 5) + readout. GROUP = 막대 fill + read-only

### M3d — Timeline 뷰 (`/projects/:id/timeline`) ✓
- 직접 SVG/CSS grid (외부 Gantt 라이브러리 미도입). v1 = **읽기 전용** 막대
- 단위 토글: 일/주/월/분기 (px-per-day: 24/10/4/2). 가로 스크롤 + sticky 라벨/헤더
- Date 처리는 day-count UTC 통일 (parseYmd → Date.UTC → ms/86400000) → local TZ off-by-one 회피
- 데이터 기반 range: min/max(\*Effective) ± 3일 padding. 빈 데이터면 안내 메시지
- 빈 일자 노드는 라벨만 표시 (구조 유지)
- "오늘" 세로선 + "오늘로 이동" 버튼
- 우측 NodeDetail/Comments/History 패널 재사용 (canEdit 동일). 막대는 read-only 지만 패널은 정상 편집 가능
- Tree↔Timeline 펼침 상태 비공유 (Zustand 회피)

---

## 4. 검증된 API 엔드포인트 (29개)

```
# 인증
POST   /api/v1/auth/login                    {username, password}
POST   /api/v1/auth/logout
GET    /api/v1/auth/me
POST   /api/v1/auth/change-password          {current, next}

# 사용자 관리 (ADMIN)
GET    /api/v1/admin/users?query=&status=
POST   /api/v1/admin/users                   {username, displayName, initialPassword}
PATCH  /api/v1/admin/users/:id               {displayName?, isActive?}
POST   /api/v1/admin/users/:id/reset-password  → {temporaryPassword}
POST   /api/v1/admin/users/:id/unlock          → 204

# 프로젝트 + 멤버
GET    /api/v1/projects                      # 가시성 필터
GET    /api/v1/projects/:id
POST   /api/v1/admin/projects                {name, description?, managerUserIds[]}
PATCH  /api/v1/admin/projects/:id            {..., expectedUpdatedAt}
DELETE /api/v1/admin/projects/:id            # ARCHIVED 만 hard delete
GET    /api/v1/projects/:id/members
POST   /api/v1/projects/:id/members          {userId, role}
DELETE /api/v1/projects/:id/members/:userId

# 노드 트리
GET    /api/v1/projects/:projectId/nodes     # progressEffective 동봉
POST   /api/v1/projects/:projectId/nodes     {kind, parentId?, title, ..., progress?}
PATCH  /api/v1/nodes/:id                     {..., progress?, expectedUpdatedAt}
POST   /api/v1/nodes/:id/move                {newParentId, newSortOrder, expectedUpdatedAt}
DELETE /api/v1/nodes/:id

GET    /api/v1/nodes/:nodeId/comments
POST   /api/v1/nodes/:nodeId/comments        {body}
DELETE /api/v1/comments/:cid
GET    /api/v1/nodes/:id/history             # 200건 take

# 헬스체크 + 백업
GET    /api/v1/health
GET    /api/v1/health/backup                 # 디렉토리 스캔 last-success
POST   /api/v1/admin/health/backup/run       # 동기 응답
```

검증 방법: typecheck (api+web+shared) + build + Playwright UI smoke + curl 기반 백엔드 smoke.

---

## 5. 핵심 결정 이력

### 글로벌 (DESIGN §12)
| # | 결정 |
|---|---|
| ① 사용자 규모 | 전체 150명 이하 |
| ② 비밀번호 정책 | 최소 10자 / 영·숫·특 중 3종 / username 포함 금지 |
| ③ 세션 | 슬라이딩 30분 + 절대 만료 12시간 |
| ④ 자동 백업 시각 | 04:00 KST (Asia/Seoul TZ 하드코드) |
| ⑤ 백업 보존 | 30일 |
| ⑥ 초기 ADMIN | 환경변수 1회 시딩 + 첫 로그인 비번 변경 강제. 단일 ADMIN 운영 |

### M1
| # | 항목 | 채택 |
|---|---|---|
| 1 | CSRF 전략 | Origin/Referer 검사 + SameSite=Lax. **더블서밋 토큰 미사용** |
| 2 | 로그인 잠금 저장소 | DB 컬럼 (`users.failed_login_count`, `users.locked_until`) |
| 3 | `global_role` 변경 API | **HTTP 비공개**. 시딩 + DB 직접 조작만 |
| 4 | CSRF 토큰 엔드포인트 | 미도입 |
| 5 | 만료 세션 cleanup | lazy + 로그인 시 본인 세션 sweep |

### M2 (a/b/c)
| # | 항목 | 채택 |
|---|---|---|
| AdminMode | 컨텍스트 주입 (차단 X). non-ADMIN 의 `X-Admin-Mode` 헤더는 silent 무시 |
| 동시성 충돌 | `expectedUpdatedAt` body 필드 → 409 + 토스트 (변경분 비교 모달은 v1.x) |
| Project DELETE | ARCHIVED 만 hard delete. ACTIVE 는 409 NOT_ARCHIVED |
| 트리 깊이 | `< MAX_TREE_DEPTH (=5)` — 0..4 |
| sortOrder | 1-based dense (step 1). move 시 양쪽 부모 repack + clamp |
| GROUP 일정 | 자동집계 (`startAtEffective`/`endAtEffective`). UPDATE 의 GROUP startAt/endAt = 거부 |
| 트리 dnd | v1 미지원 → ↑↓ 형제 reorder + ⇄ 부모변경 모달 |
| 트리 라이브러리 | (a) 직접 구현 — `NodeTree.tsx` 재귀 컴포넌트 |

### M3
| # | 항목 | 채택 | 이유 |
|---|---|---|---|
| Timeline 라이브러리 | (a) 직접 SVG/CSS | 외부(SVAR Gantt) 검토했으나 도메인(권한/expectedUpdatedAt/GROUP 자동집계/depth) 정합 부담 + Air-gap 번들 무게 |
| Timeline 상태 변경 | (a) 읽기 전용 | 드래그 편집은 v1.x |
| 백업 자동화 | (b) NestJS 스케줄러 | 컨테이너 1개 운영 단순. `BACKUP_CRON` env 정합 |
| 사용자 관리 UI | (a) M3 포함 | 백엔드는 M1 완료. ADMIN 운영의 마지막 빈 칸 |
| 진행율 도메인 | **B 도입** — `ScheduleNode.progress` (Int 0..100) | Timeline 시각적 가치 + GROUP effective 인프라 재사용 |
| progress 집계 | 자손 ITEM 단순평균(반올림) | 예측 가능, 기간 가중의 date-less 폴백 함정 회피 |

---

## 6. 알려진 caveat (의도된 한계)

- **adminMode OFF 중** 비멤버 프로젝트 페이지에 머무르면 다음 refetch 가 403 → 토스트만 (자동 리다이렉트 X)
- **트리 dnd** 미지원 (부모 변경은 ⇄ 버튼 모달)
- **이력 페이지네이션** 미지원 (200건 take)
- **Timeline 드래그 편집** 미지원 (DESIGN §6.2.2 는 v1.x 로 연기)
- **사용자 관리에서 ADMIN 권한 승격 X** — 단일 ADMIN 운영 (DESIGN §12-⑥)
- **dev DB 잠금**: `prisma migrate dev` 시 dev 서버를 멈춰야 함 (HANDOFF §6 참조)
- **모노레포 빌드 함정**: `tsconfig.base.json` 의 `paths` 미사용 + `vite.config.ts` 의 `commonjsOptions.include` 필요

---

## 7. v1 출시까지 남은 항목

| # | 항목 | DESIGN 참조 | 분량 (예상) |
|---|---|---|---|
| **M4** | 오프라인 번들 + 운영 검증 — Docker 이미지 빌드 검증, `tar` 번들링, `install.sh`/`upgrade.sh` dry-run, `restore-system.sh` 시스템 복원 검증, `docs/ops-guide.md` 작성 | §8, §10 | **0.5~1주** |
| M5 | 프로젝트 ZIP 백업·복원 UI — admin 즉시 다운로드 + 업로드 → 새 프로젝트 생성 흐름 | §7.2, §7.3 | 0.5주 |
| 폴리시 | 한국어 i18n 분리 (`i18n/ko.json`), 키보드 내비/ARIA, README 운영 절차 보강 | §6.5 | 자잘 |

→ **M4 가 최우선** (v1 = "운영 환경에 배포 가능한 상태"). 백엔드/프론트는 검증 끝, 남은 건 패키징 + 절차.

### v1.x (출시 후)
- Timeline 드래그 편집 (DESIGN §6.2.2)
- 캘린더 뷰 (DESIGN §11 로드맵)
- 첨부파일 / 의존성 / 반복일정 (DESIGN §3.2 확장 포인트)
- LDAP/AD 연동 (`auth_providers`)

---

## 8. 커밋 히스토리

```
8060081 2026-05-01 M3d: Timeline 뷰 (/projects/:id/timeline) — 읽기 전용 + 진행율 fill
c595c0f 2026-05-01 M3c: 진행율(progress) 도메인 + Tree 뷰 통합
d7e583f 2026-05-01 M3b: 백업 자동화 — NestJS 스케줄러 + VACUUM INTO + manual trigger
a64885b 2026-05-01 M3a: 사용자 관리 web UI — /admin/users + 생성/리셋/잠금해제/active 토글
10ff382 2026-05-01 M2c: 웹 프론트엔드 — 프로젝트/트리/댓글/이력/멤버 + AdminMode 토글
cc8262b 2026-05-01 fix(nodes): same-parent forward move sortOrder gap
87f2e38 2026-05-01 M2b: 노드 트리 백엔드 + 댓글/이력 + history snapshot 마이그레이션
647fa96 2026-05-01 M2a: 프로젝트/멤버 CRUD + AdminMode 컨텍스트 주입 + 동시성 409
18cd4cc 2026-05-01 chore: ignore tsc 부산물 + HANDOFF M2 진입용 갱신
4832827 2026-05-01 M1 auth: 세션/사용자/잠금/감사로그 + 로그인 화면
ad16a48 2026-04-30 M0 fixes + handoff doc
587fed3 2026-04-30 initial commit
```

---

## 9. 참고 문서

- 설계: [DESIGN.md](./DESIGN.md) v1.0 동결
- 인수인계: [HANDOFF.md](./HANDOFF.md) — 다음 세션 시작 가이드
- 사용 절차: [README.md](./README.md)
- 스키마: [apps/api/prisma/schema.prisma](./apps/api/prisma/schema.prisma)
- 공유 타입: [packages/shared/src/index.ts](./packages/shared/src/index.ts)

---

*보고일: 2026-05-01 · 다음 마일스톤: M4 (오프라인 번들 + 운영 검증)*
