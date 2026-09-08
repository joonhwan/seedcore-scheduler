# SAM Scheduler — AI Agent 작업 지침서 (AGENTS.md)

본 문서는 **SAM Scheduler** 프로젝트에서 코드를 분석하고 수정하는 AI 에이전트(및 개발자)가 반드시 준수해야 하는 아키텍처 규칙, 핵심 정책, 개발 제약사항, 그리고 자주 발생하는 문제의 해결 방법을 정리한 지침서입니다.

---

## 1. 프로젝트 개요

SAM Scheduler는 외부 네트워크와 격리된 **폐쇄망(Air-gap) 환경**에서 구동되는 단일 서버용 프로젝트 일정 관리 웹 애플리케이션입니다.

- **사용자 규모**: 전체 150명 이하 (동시/등록 포함)
- **일정 규모**: 프로젝트당 일정 노드(Node) 5,000개 이내
- **핵심 목표**: 외부 서비스(이메일, SSO 등)에 의존하지 않는 독립형 계정/인증 구조와, 높은 무결성을 보장하는 다중 멤버 일정 편집 시스템 구현

---

## 2. 기술 스택 및 구조

### 2.1 주요 기술
- **Backend**: Node.js 22.x, NestJS 10, Prisma 5.22, SQLite (WAL 모드)
  - **하한은 22.13 입니다.** pnpm 11(`packageManager` 로 고정)이 `node:sqlite` 를 쓰기 때문에
    Node 20 에서는 `pnpm install` 이 `ERR_UNKNOWN_BUILTIN_MODULE` 로 죽습니다. CI(`ci.yml`)와
    도커 이미지(`Dockerfile.fly`, `apps/*/Dockerfile`)의 Node 버전도 이 이유로 22 입니다.
- **Frontend**: React 18, Vite 5, Tailwind CSS, TanStack Query
  - **전역 상태는 `apps/web/src/lib/store.ts` 의 자체 구현입니다.** `useSyncExternalStore` 위에 얹은
    `createStore`·`useStore` 이며 `adminMode`·`theme`·`toast` 가 이 방식입니다. 이 문서는 오랫동안
    Zustand 를 적어 두었으나 **설치된 적이 없습니다**(`apps/web/package.json` 에 없습니다).
    전역 상태가 필요하면 새 라이브러리를 들이지 말고 이 구현을 쓰십시오.
- **Shared**: `packages/shared` (Zod 기반 스키마 및 공통 유틸리티)
- **Deploy**: Docker Compose, Nginx (정적 SPA 파일 서빙 및 API 리버스 프록시) / 또는 단일 exe 배포판
  - **현재 어떤 자체 배포도 HTTPS를 쓰지 않습니다.** `deploy/nginx.conf`는 `listen 80;`뿐이고
    `deploy/compose.yaml`에도 인증서나 443 설정이 없습니다. `sp-server.exe`는 평문 HTTP로 직접 서비스합니다.
    (Fly.io 배포만 예외로, TLS는 Fly 엣지에서 끝납니다.)
  - 이 전제는 보안 헤더 설정과 직접 얽혀 있습니다 — helmet 기본값은 HTTPS를 가정하므로
    `upgrade-insecure-requests`와 HSTS를 껐습니다. 이유는 `apps/api/src/main.ts`의 helmet 설정 주석 참고.
    TLS를 정식 도입할 때 그 두 개를 함께 되살려야 합니다.

---

## 3. 로컬 개발 및 빌드 순서

**매일 개발할 때는 `pnpm dev` 하나면 됩니다.** 이 명령이 `scripts/dev.mjs` 를 거쳐 공유 패키지
빌드 → vite 사전 번들 캐시 삭제 → web·api 기동을 순서대로 처리합니다. 손으로 챙기던 두 단계를
스크립트가 대신하므로 빠뜨릴 일이 없습니다.

```bash
pnpm dev
# → 브라우저로 http://localhost:5173 접속
```

**저장소를 처음 받았거나 스키마가 바뀐 경우에만** 아래 준비 단계가 먼저 필요합니다. 데이터베이스와
Prisma Client가 없는 상태로 기동하면 NestJS가 부팅 시 크래시를 일으키고, 프론트엔드에서 프록시
에러가 납니다.

```bash
# 1) 의존성 설치
pnpm install

# 2) API 환경변수 설정
cp apps/api/.env.example apps/api/.env

# 3) Prisma 마이그레이션 + 클라이언트 생성 + 시드 데이터 적용
pnpm -F @sam/api prisma:migrate:dev
```

> **접속 정보**:
> - 웹 프론트엔드: `http://localhost:5173`
> - API 헬스체크: `http://localhost:5173/api/v1/health`
> - 초기 관리자 계정: `admin` / `ChangeMe!Now` (첫 로그인 시 비밀번호 변경 강제됨)

> **브라우저로 3000 을 직접 열지 마십시오.** 5173 이 `/api` 를 3000 으로 프록시하므로 API 는 그
> 뒤에서 함께 떠 있지만, 3000 을 직접 열면 API 서버가 곁다리로 서빙하는 정적 화면이 뜹니다.
> 그 경로는 `resolveStaticRoot()`(`app.module.ts`)가 후보 순서대로 찾는데 `apps/api/public` 이
> `apps/web/dist` 보다 먼저 걸리고, 그 폴더는 `pnpm build:exe` 가 남기는 산출물(git 무시 대상)이라
> **몇 달 전 exe 를 빌드한 흔적이 있으면 그 시절 화면이 그대로 뜹니다.** 고친 기능이 반영되지
> 않는 것처럼 보이는 전형적인 함정입니다. exe 를 검증할 때만 `pnpm dev` 를 끄고 3000 으로 접속합니다.

---

## 4. AI 에이전트 핵심 개발 규칙

### 4.1 에이전트 행동 및 코드 제약
- **`cd` 명령어 사용 금지**: 터미널에서 작업할 때 `cd` 명령어를 독립적으로 실행하지 마십시오. 모든 명령어는 호출 도구의 `Cwd` 매개변수를 직접 지정하여 실행해야 합니다.
- **주석 보존**: 기존 코드에 작성되어 있는 인라인 주석, 설계 마일스톤 설명, docstring 등은 기능 변경과 직접 관계가 없는 한 **임의로 삭제하거나 변경하지 말고 보존**하십시오.
- **타입 검사 수행**: 코드 수정 후에는 반드시 `pnpm -r typecheck` 또는 각 워크스페이스별 빌드 명령어를 실행하여 컴파일 에러가 없는지 검증하십시오.

### 4.2 데이터 검증 (Zod 사용)
- 본 프로젝트는 `class-validator` 및 `ValidationPipe`를 **사용하지 않습니다**.
- 모든 데이터 입력 및 API DTO 검증은 **`packages/shared`에 정의된 Zod 스키마**와 백엔드의 `ZodValidationPipe`를 통해서만 처리합니다.
- 새로운 API를 설계하거나 수정할 때는 `packages/shared/src/index.ts`에 Zod 스키마를 추가/수정하고, 백엔드 컨트롤러에서 다음과 같이 데코레이터를 적용하십시오:
  ```typescript
  @Post()
  @UsePipes(new ZodValidationPipe(CreateNodeDto))
  async createNode(@Body() body: CreateNodeDto) { ... }
  ```

### 4.3 SQLite & Prisma 제약사항
- SQLite는 `enum` 타입을 지원하지 않습니다. 
- 따라서 Prisma 스키마(`schema.prisma`)에는 `String` 타입으로 선언하고, 애플리케이션 레벨(Zod 스키마)에서 제한하며, 필요한 경우 마이그레이션 SQL에 `CHECK` 제약 조건(예: `CHECK (global_role IN ('ADMIN', 'USER'))`)을 직접 명시해야 합니다.
- Prisma 갱신 시 `exactOptionalPropertyTypes: true` 정책으로 인해 optional 필드가 `undefined`로 넘어오는 현상을 주의하십시오. 필요한 경우 Prisma 쿼리 작성 시 `x !== undefined ? x : undefined` 또는 비구조화 할당 패턴으로 분기 처리해야 합니다.

### 4.4 인증, 인가 및 관리자 모드
- **세션 쿠키 인증**: `sam_sid` 세션 쿠키(HttpOnly + SameSite=Lax + Path=/api/v1) 방식을 취합니다. JWT는 사용하지 않습니다.
- **세션 수명 (슬라이딩 없음)**: 로그인 후 **12시간 고정**이며(`SESSION_TTL_MS`, `packages/shared`), 요청을 보낸다고 만료가 미뤄지지 않습니다. 연장은 `POST /api/v1/auth/extend` 를 사용자가 명시적으로 호출할 때만 일어나고, 화면은 만료 10분 전(`SESSION_EXPIRY_WARNING_MS`)에 `SessionExpiryDialog` 로 물어봅니다.
  - 예전에는 "마지막 조작으로부터 30분(슬라이딩) + 로그인 후 12시간(절대)" 두 겹이었습니다. 서버는 만료를 미뤘지만 **브라우저 쿠키의 만료 시각을 다시 내려보내지 않아** 실제로는 로그인 30분 뒤 무조건 끊겼습니다("작업 중에 로그인 화면으로 튕김"의 정체입니다).
  - 그래서 **만료 시각을 바꾸는 곳은 반드시 쿠키를 다시 발급해야 합니다.** `AuthController` 의 `login` 과 `extend` 두 곳뿐이며, `AuthGuard` 는 만료를 건드리지 않습니다(`lastSeenAt` 만 갱신 — 접속자 목록용).
- **인증 가드**: 백엔드는 전역으로 `AuthGuard`가 적용되어 있습니다. 비로그인 접근이 필요한 엔드포인트는 `@Public()` 데코레이터를 사용하십시오.
- **비밀번호 해싱 (argon2id / bcrypt 두 포맷 혼재)**: 현재 해싱은 `bcryptjs`로 합니다. native 모듈인 `argon2`가 단일 exe(ncc + pkg)에 번들되지 않아 커밋 `017bca7`에서 교체했습니다. 다만 그 이전에 만들어진 계정의 해시는 DB에 `$argon2id$...` 그대로 남아 있어 **`passwordHash` 한 컬럼에 두 포맷이 섞여 있습니다**. `AuthService.verifyPassword()`가 해시 접두어로 알고리즘을 판별해 양쪽을 모두 검증하고, argon2 해시로 로그인에 성공하면 그 자리에서 bcrypt로 재해싱해 저장합니다(평문을 알 수 있는 시점이 그때뿐입니다). 각 계정이 한 번 로그인하면 자연히 bcrypt로 정리됩니다.
  - `auth.service.ts`의 `argon2`는 `require(변수)` 형태로 느슨하게 불러옵니다. 이것을 정적 `import`로 바꾸면 ncc가 native 모듈을 번들에 끌어들여 exe 빌드가 깨집니다 — **바꾸지 마십시오.**
- **비밀번호 정책 (현재 비활성)**: 정책 판단의 단일 지점은 `packages/shared`의 `validatePassword`이지만, 커밋 `08afd57`에서 **모든 규칙이 제거되어 항상 `null`(통과)을 돌려줍니다**. `PASSWORD_MIN_LENGTH`도 `1`입니다. 즉 "최소 10자·영숫특 3종 조합·username 포함 금지" 같은 규칙은 **현재 코드에 없습니다** — 정책이 걸려 있다고 가정하고 코드를 읽거나 쓰지 마십시오. 되살릴 때는 이 함수 한 곳만 고치면 웹 UI·API·리셋 CLI에 함께 적용됩니다.
- **계정 잠금 (현재 비활성)**: 커밋 `c834f49`에서 비활성화되었습니다. `AuthService.login()`은 로그인 실패 시 `failedLoginCount`만 올리고 `lockedUntil`은 항상 `null`로 둡니다(`shouldLock = false`로 고정). 로그인 경로에 `lockedUntil` 검사 자체가 없으므로 값을 수동으로 넣어도 차단되지 않습니다. `FAILED_LOCK_THRESHOLD`(5)·`LOCK_DURATION_MS`(15분) 상수와 ADMIN unlock 엔드포인트(`POST /api/v1/admin/users/:id/unlock`)는 남아 있으나 실제로 잠기는 일이 없어 풀 것도 없습니다. 실패 횟수 누적과 `LOGIN_FAILURE` 감사로그 기록은 계속 동작합니다.
- **로그인 시도 제한 (유일하게 살아 있는 방어)**: 위의 비밀번호 정책과 계정 잠금이 모두 비활성이므로, 온라인 비밀번호 추측을 늦추는 장치는 `RateLimitService` 하나뿐입니다. IP 하나당 60초에 **20회**이며(`LOGIN_RATE_LIMIT`, `auth.service.ts`), **실패만 누적됩니다** — 인증에 성공하면 그 IP 의 통을 즉시 비웁니다. 통 키는 IP 뿐이고 계정을 구분하지 않으므로, 성공까지 세면 같은 IP 를 쓰는 남의 정상 로그인 때문에 내가 막힙니다(시드 스크립트가 계정마다 로그인하는 동안 브라우저 로그인이 분당 한 번만 통과한 사고가 그것입니다).
  - 거부 응답은 `401` + `{"error":"RATE_LIMITED","retryAfterSeconds":n}` 입니다. 상태 코드가 `429` 가 아니고 `Retry-After` 헤더도 없으니, 화면은 본문의 `retryAfterSeconds` 를 읽습니다(`LoginPage.tsx`). 재시도가 창 시작 시각을 밀지 않으므로 대기 시간은 아무리 길어도 60초입니다.
  - **제한에 걸린 요청은 파일 로그에만 남습니다.** 감사로그는 제한 검사보다 뒤에 있어 `LOGIN_FAILURE` 조차 기록되지 않고, 요청 단위 로그를 남기는 미들웨어도 없습니다. 그래서 `AuthService.login()` 이 `logger.warn` 으로 IP·username·남은 시간을 남깁니다. 감사로그(DB)로 옮기지 마십시오 — 요청이 몰리는 상황에서 SQLite 단일 Writer 경합을 키웁니다.
- **접속자 IP 판정 (`TRUSTED_PROXY_HOPS`)**: 위 제한의 단위이자 감사로그에 남는 값이라, 클라이언트가 고를 수 없어야 합니다. Express 의 `trust proxy` 를 홉 수로 설정하고 `req.ip` 만 읽습니다(`common/trust-proxy.ts`, `request-context.ts`). **기본값은 0 이고, 프록시가 실제로 있는 배포에서만 명시합니다** — exe 는 0, docker+nginx 는 1, Fly.io 는 2(Fly 엣지 + 컨테이너 내부 nginx)입니다. 실제보다 크게 잡으면 `X-Forwarded-For` 위조로 제한을 무력화할 수 있으니 올리지 마십시오. 부팅 로그의 "앞단 프록시 …" 줄에서 현재 값을 확인할 수 있습니다.
- **상태 변경 보안**: 생성, 수정, 삭제 등의 상태 변화를 유발하는 모든 라우트에는 `@UseGuards(OriginGuard)`를 필수적으로 부착해야 합니다.
- **관리자 모드 (AdminMode)**:
  - ADMIN 역할을 가진 사용자가 헤더에 `X-Admin-Mode: 1`을 포함해 보낼 때만 백엔드 가드에서 `req.adminMode = true`를 주입합니다. 일반 USER의 헤더는 무시됩니다.
  - `req.adminMode === true`인 상태에서 수행되는 모든 데이터 수정 액션은 감사로그 액션을 `'ADMIN_OVERRIDE_EDIT'`로 별도 기록해야 합니다.
  - ADMIN은 관리자 모드가 활성화된 상태에서만 모든 프로젝트에 대한 CRUD 및 가시성을 확보할 수 있습니다. 기본 일반 모드에서는 본인이 멤버로 소속된 프로젝트만 보입니다.

### 4.5 동시성 제어 (expectedUpdatedAt)
- 데이터 정합성을 유지하기 위해 모든 수정(UPDATE/MOVE 등) 요청은 body에 `expectedUpdatedAt` (수정 대상 엔티티의 최종 수정일 문자열) 필드를 함께 받아야 합니다.
- 백엔드 서비스에서는 업데이트 수행 직전 DB의 기존 `updatedAt` 값과 비교하여, 일치하지 않는 경우 즉시 `409 Conflict` 예외를 발생시켜야 합니다.
  ```json
  {
    "code": "CONFLICT",
    "message": "데이터가 다른 사용자에 의해 변경되었습니다. 새로고침 후 다시 시도하십시오.",
    "currentUpdatedAt": "2026-05-01T12:00:00.000Z"
  }
  ```
- **일정을 고쳤다고 `projects.updated_at` 을 건드리지 마십시오.** 그 값은 위 동시성 검사의 기준이라, 남이 일정 하나만 고쳐도 내 프로젝트 이름 변경이 409로 튕깁니다. 목록의 "수정일"은 대신 `ProjectListItem.lastScheduleChangeAt` 이 담당하며, 이 값은 `node_history` 의 최신 시각을 읽어 채웁니다(`ProjectsService.lastScheduleChangeMap`). 삭제된 일정의 변경까지 잡히고 댓글은 잡히지 않는 것이 의도된 동작입니다. 화면에 하나로 합쳐 보여줄 때는 `projectLastModifiedAt()`(`packages/shared`)을 쓰십시오.

### 4.6 일정 트리 구조 및 집계 정책
- **트리 깊이**: 최대 **10단계** (`depth` 0~9)까지만 허용합니다. 노드 생성 및 이동 시 항상 대상의 깊이를 계산하여 제한해야 합니다.
- **노드 종류 (`kind`)**:
  - `GROUP`: 하위 노드를 가질 수 있는 폴더 역할. 기간(`startAt`/`endAt`) 및 진행률(`progress`) 필드를 **직접 입력/수정할 수 없으며**, 자손 ITEM들의 일정 범위 및 단순평균으로 **자동 계산(Effective)**됩니다.
  - `ITEM`: 하위 노드를 가질 수 없는 실제 작업 단위. 시작일, 종료일, 진행률을 직접 입력받습니다.
- **일정 계산 공식**:
  - `GROUP.startAtEffective = MIN(자손 ITEM들의 startAt, 자손 GROUP의 startAtEffective)`
  - `GROUP.endAtEffective = MAX(자손 ITEM들의 endAt, 자손 GROUP의 endAtEffective)`
- **진행률 계산 공식**:
  - `GROUP.progressEffective = ROUND(자손 ITEM들의 progress의 단순 평균)` (자손 ITEM이 없는 빈 GROUP인 경우 `null` 반환)
- **정렬 (`sortOrder`)**: 1부터 시작하며 밀집 정렬(Dense, Step 1) 상태를 유지합니다. 노드가 생성되거나 부모가 바뀌어 이동할 경우, 양쪽 부모 아래에 있는 형제 노드들의 `sortOrder`를 조밀하게 재조정(Repack)해야 합니다.

### 4.7 노드 삭제와 이력 보존
- 일정을 영구 삭제하더라도 해당 일정에 대한 역사적 감사 추적이 가능해야 합니다.
- `NodeHistory` 모델은 `nodeId` 외에도 `nodeIdSnapshot` (UUID 문자열) 및 `projectIdSnapshot` (UUID 문자열) 필드를 필수적으로 가집니다.
- 노드를 `DELETE`할 때 `NodeHistory.nodeId`는 `SetNull` 처리되어 데이터베이스 관계는 끊어지지만, `nodeIdSnapshot`을 통해 과거 수정 기록을 여전히 조회할 수 있게 유지해야 합니다.

---

## 5. 자주 만나는 문제 및 트러블슈팅

> 상세 원인 분석과 해결 절차는 **`sam-troubleshooting` 스킬**에 있습니다. 아래는 미리 알고 있어야 하는 요약입니다.
> 다루는 문제: SQLite `database is locked`, TypeScript incremental 캐시로 인한 옛날 빌드 실행,
> `@sam/shared` 임포트 실패, shared 새 export 추가 후 빈 화면.

- **`prisma migrate dev`는 개발 서버를 끄고 돌린다.** SQLite는 단일 Writer라 `pnpm dev`가 DB 핸들을 쥐고 있으면 락이 걸립니다.
- **`shared` 에 새 export(새 이름)를 추가하면 `apps/web/node_modules/.vite` 를 지우고 dev 서버를 재시작한다.**
  안 지우면 vite 사전 번들링 캐시에 그 심볼이 없어 조용히 `undefined` 가 되고, **에러 메시지 없이 화면만 빈 채로** 뜹니다.
  (기존 함수 내용만 바꾼 경우는 `pnpm -F @sam/shared build` 로 충분)
  → `pnpm dev` 로 띄우면 `scripts/dev.mjs` 가 매번 캐시를 지우므로 이 함정에 걸리지 않습니다.
  dev 서버를 다른 방법으로 띄울 때만 손으로 챙기면 됩니다.

## 6. 마일스톤 상황 및 향후 방향

완료된 마일스톤(M0~M3)과 앞으로의 M4·M5·v1.x 계획은 **`HANDOFF.md`** 에 정리되어 있습니다.
진행 상황을 알아야 하는 작업이라면 그 파일을 읽으십시오.

## 7. 개발자/에이전트 준수 사항 및 알림 규칙

- **데이터베이스 변경 시 사용자 알림**: 향후 Prisma 스키마(`schema.prisma`), 데이터베이스 테이블 구조, 또는 마이그레이션 파일 추가/변경 등 **DB 관련 변경사항이 발생할 경우**, 작업을 마친 후 사용자에게 구체적인 DB 변경 내용과 파이프라인 반영 여부를 반드시 상세하게 설명하고 공유해야 합니다.

- **스키마를 바꾼 브랜치를 `master` 에 머지하기 전에 fly.io 볼륨 스냅샷을 뜹니다.** `master` 에 push 하면
  `deploy.yml` 이 돌고, `Dockerfile.fly` 의 기동 스크립트가 컨테이너를 띄울 때마다
  `pnpm prisma:migrate:deploy` 를 먼저 부릅니다. 즉 **머지되는 순간 fly.io 볼륨의 DB 에 마이그레이션이
  자동으로 적용됩니다.** 고객 서버 경로와 달리 이 경로에는 `sp-migrate.exe` 가 뜨는 적용 직전 사본이
  없으므로, 머지 전에 손으로 한 번 떠 둡니다.

  ```bash
  fly volumes list -a seedcore-scheduler          # 볼륨 id 확인
  fly volumes snapshots create <volume id>        # 적용 직전 사본
  ```

  깜빡했더라도 되돌릴 사본이 두 겹 있습니다. fly.io 가 **자동으로 뜨는 일일 스냅샷**(기본 5일 보관,
  `fly volumes snapshots list <volume id>` 로 확인)과, 앱이 매일 04:00(KST)에 볼륨 안
  `/var/seedcore-scheduler/backup/daily/<YYYYMMDD>/app.db.gz` 로 남기는 **자체 백업**(30일 보관)입니다.
  뒤의 것은 인증 없이 `GET /api/v1/health/backup` 으로 최신 시각을 확인할 수 있고,
  `fly ssh sftp get <경로> -a seedcore-scheduler` 로 내려받습니다.

---

 에이전트는 작업을 시작하기 전 본 문서를 완독하고 준수하여, 본 프로젝트 고유의 보안 아키텍처와 트리 구조 무결성을 훼손하지 않도록 주의해 주십시오.
