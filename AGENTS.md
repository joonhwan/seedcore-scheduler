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
- **Backend**: Node.js 20.x, NestJS 10, Prisma 5.22, SQLite (WAL 모드)
- **Frontend**: React 18, Vite 5, Tailwind CSS, TanStack Query, Zustand
- **Shared**: `packages/shared` (Zod 기반 스키마 및 공통 유틸리티)
- **Deploy**: Docker Compose, Nginx (TLS 종단 및 정적 SPA 파일 서빙)

### 2.2 디렉터리 구조
```
sam-scheduler/
├─ apps/
│  ├─ api/               # NestJS 백엔드 애플리케이션
│  │  ├─ prisma/         # Prisma 스키마 및 마이그레이션 파일
│  │  └─ src/            # 컨트롤러, 서비스, 가드, 모듈 등
│  └─ web/               # React 프론트엔드 (Vite SPA)
│     ├─ src/components/ # 트리 및 타임라인 등 핵심 UI 컴포넌트
│     └─ src/pages/      # 뷰 페이지들
├─ packages/
│  └─ shared/            # 백엔드/프론트엔드 공통 Zod DTO 및 유틸리티
├─ deploy/               # 운영 배포 구성 (compose.yaml, nginx.conf)
├─ scripts/              # 백그라운드 백업/복원 셸 스크립트 (수동 Fallback)
├─ DESIGN.md             # v1.0 상세 설계 문서
├─ README.md             # 로컬 개발 및 운영 배포 가이드
└─ HANDOFF.md            # 마일스톤 이관 및 작업 히스토리 문서
```

---

## 3. 로컬 개발 및 빌드 순서

로컬 개발 환경을 부팅할 때는 **순서가 매우 중요**합니다. 데이터베이스와 Prisma Client가 빌드 및 시딩되지 않은 상태에서 `pnpm dev`를 실행하면 NestJS가 부팅 시 크래시를 일으키며, 프론트엔드 프록시 에러가 발생합니다.

```bash
# 1) 의존성 설치
pnpm install

# 2) 공유 패키지 빌드 (packages/shared 내 dist 디렉터리 생성)
pnpm -F @sam/shared build

# 3) API 환경변수 설정
cp apps/api/.env.example apps/api/.env

# 4) Prisma 마이그레이션 + 클라이언트 생성 + 시드 데이터 적용
pnpm -F @sam/api prisma:migrate:dev

# 5) 로컬 개발 서버 실행 (web: 5173, api: 3000)
pnpm dev
```

> **접속 정보**:
> - 웹 프론트엔드: `http://localhost:5173`
> - API 헬스체크: `http://localhost:5173/api/v1/health`
> - 초기 관리자 계정: `admin` / `ChangeMe!Now` (첫 로그인 시 비밀번호 변경 강제됨)

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
- **인증 가드**: 백엔드는 전역으로 `AuthGuard`가 적용되어 있습니다. 비로그인 접근이 필요한 엔드포인트는 `@Public()` 데코레이터를 사용하십시오.
- **비밀번호 정책**: 최소 10자, 영/숫/특 중 3종 조합, username 포함 금지 규칙을 따르며, 정책 로직은 `packages/shared` 내 `validatePassword`를 공통으로 호출합니다.
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

### 4.6 일정 트리 구조 및 집계 정책
- **트리 깊이**: 최대 **5단계** (`depth` 0~4)까지만 허용합니다. 노드 생성 및 이동 시 항상 대상의 깊이를 계산하여 제한해야 합니다.
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

### 5.1 SQLite `database is locked` (P2002 / P2010 등)
- **원인**: SQLite는 단일 Writer 구조를 가집니다. 개발 서버(`pnpm dev`)가 켜져 있어 DB 접속 핸들을 쥐고 있는 상태에서 터미널을 통해 `prisma migrate dev`를 수행하면 데이터베이스 락이 발생합니다.
- **해결**: 마이그레이션 명령어를 돌릴 때는 **반드시 임시로 개발 서버를 종료**한 뒤 수행하시기 바랍니다.

### 5.2 TypeScript incremental 캐시 컴파일 오류
- **증상**: 코드를 분명히 수정했음에도 `Cannot find module '.../dist/main'` 또는 이전 컴파일 버전의 빌드가 적용되어 런타임 에러가 발생하는 경우.
- **해결**: `apps/api/tsconfig.json` 파일의 `incremental` 설정이 `false`인지 확인하고, `apps/api/tsconfig.tsbuildinfo` 파일과 `apps/api/dist` 디렉터리를 수동으로 삭제한 뒤 빌드를 재수행하십시오.

### 5.3 Shared 패키지 가져오기 실패
- **증상**: 프론트엔드나 백엔드에서 `@sam/shared` 모듈의 타입을 가져올 수 없다는 에러 발생.
- **해결**: 패키지 간의 가벼운 의존성 관리를 위해 `tsconfig.base.json`의 `paths`는 제거되어 있습니다. 반드시 로컬 개발 전 `pnpm -F @sam/shared build`를 먼저 수행하여 패키지 내 `dist` 폴더를 컴pile해야 빌드 도구(Vite, NestJS)가 정상적으로 모듈을 해석할 수 있습니다.

---

## 6. 마일스톤 상황 및 향후 방향

현재 **M0 ~ M3(a/b/c/d)** 마일스톤이 완료되어 인증, 코어 일정 트리, 댓글 및 이력 조회, 진행률 집계, 백업 자동화(NestJS 스케줄러 내장), 그리고 읽기 전용 타임라인(Gantt) 뷰가 완성되어 있습니다.

다음 개발 마일스톤 단계는 다음과 같습니다:
1. **M4**: 에어갭 오프라인 배포를 위한 패키징 검증
   - `docker compose` 빌드 검증 및 이미지 `tar` 파일 저장
   - `deploy/scripts` 내 설치(`install.sh`), 업그레이드(`upgrade.sh`), 시스템 복원(`restore-system.sh`) 스크립트 작성 및 dry-run 검증
   - `docs/ops-guide.md` (운영 가이드 문서) 작성
2. **M5**: 프로젝트 단위 백업 및 복원 UI
   - 특정 프로젝트를 manifest 데이터를 포함한 단일 ZIP 파일로 백업하고, 업로드 시 새 프로젝트로 시딩 및 매핑해 복원하는 관리자 플로우 구현
3. **v1.x 이후**: 타임라인 드래그 편집 기능 지원, 캘린더 뷰, 파일 첨부 기능 등

---

 에이전트는 작업을 시작하기 전 본 문서를 완독하고 준수하여, 본 프로젝트 고유의 보안 아키텍처와 트리 구조 무결성을 훼손하지 않도록 주의해 주십시오.
