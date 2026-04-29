# SAM Scheduler — 상세 설계문서 v1.0

> 본 문서는 사내(Air-gap) 환경에서 운영되는 프로젝트 일정관리 웹 애플리케이션의 설계서입니다.
> v1.0 시점에서 §12 잔여 확인 항목이 모두 결정되어 본문에 반영되었습니다.

---

## 1. 개요

### 1.1 목적
- 외부망과 단절된(Air-gap) 사내 서버에서 구동되는 프로젝트 일정관리 도구
- 외부 이메일/SSO 의존 없이, **관리자에 의한 사용자 등록·패스워드 리셋** 으로 계정을 운영
- 프로젝트 단위로 격리된 일정 트리(Group/Item) 를 다수의 멤버가 협업 편집
- 테이블 뷰와 Timeline 뷰(일/주/월/분기) 동시 지원

### 1.2 핵심 비기능 요구
| 항목 | 목표 |
|---|---|
| 배포 환경 | Air-gap 사내 리눅스 서버 (인터넷 불가). 오프라인 설치 패키지로 1회 배포 |
| 사용자 규모 | **전체 150명 이하** (등록·동시 모두 포함; 운영 기준) |
| 프로젝트 규모 | 프로젝트당 일정항목 5,000개 이내 |
| 브라우저 | **최신 Chrome / Firefox** (각 직전 안정 버전 포함). IE/Edge Legacy 미지원 |
| 가용성 | 단일 인스턴스 + 일자별 자동 백업. HA 미요구 |
| 언어 | 한국어 우선. i18n 구조만 마련(영문 등 추가 가능) |

### 1.3 v1 범위 외
| 항목 | v1 처리 | 비고 |
|---|---|---|
| 외부 이메일/SMS 알림 | 미지원 | Air-gap 환경 특성. **추후 사내 알림시스템 도입 예정** — 알림 도메인 모델은 v1 에 stub 만 마련 |
| 실시간 동시편집(OT/CRDT) | 미지원 | LWW(마지막 저장자 우선) + 충돌 안내 (§5.6) |
| 파일 첨부 | 미지원 | 확장 포인트만 마련: `attachments` 테이블 자리 + 댓글 본문에 placeholder |
| 간트 의존성(선후행) | 미지원 | 확장 포인트: `node_dependencies` 테이블 자리 |
| 반복 일정 | 미지원 | 확장 포인트: `recurrence_rule` 컬럼 자리 |
| LDAP/AD 연동 | 미지원 | 확장 포인트: `auth_provider` 추상화 (§11) |
| 모바일 전용 앱 | 미지원 | 반응형 웹으로 대응 |

---

## 2. 시스템 아키텍처

### 2.1 배치도

```
[ 사용자 브라우저 ]
        │ HTTPS (사내 도메인 / 사설 인증서)
        ▼
┌────────────────────────────────────────────┐
│ 단일 서버 (Linux, Air-gap)                 │
│                                            │
│  ┌─────────┐    ┌──────────────────────┐  │
│  │ nginx   │──▶ │  API 서버 (NestJS)   │  │
│  │ (정적   │    │  + Prisma            │  │
│  │  파일 + │    └──────────┬───────────┘  │
│  │  TLS)   │               │              │
│  └─────────┘               ▼              │
│                  ┌──────────────────────┐ │
│                  │ SQLite (WAL 모드)    │ │
│                  │ /var/sam-scheduler/  │ │
│                  │   data/app.db        │ │
│                  └──────────┬───────────┘ │
│                             │             │
│                             ▼             │
│                  ┌──────────────────────┐ │
│                  │ 백업 워커 (cron)     │ │
│                  │  · 일자별 SQLite snap│ │
│                  │  · 프로젝트 ZIP      │ │
│                  └──────────────────────┘ │
│                                            │
│  /var/sam-scheduler/                       │
│    ├─ data/      (SQLite + WAL)            │
│    ├─ backup/                              │
│    │   ├─ daily/YYYYMMDD/app.db.gz         │
│    │   └─ projects/YYYYMMDD/*.zip          │
│    └─ logs/                                │
└────────────────────────────────────────────┘
```

전 구성요소(API, DB, 정적 자원, 폰트/아이콘)는 **오프라인 번들 1개**로 배포하여 외부 네트워크 호출이 없도록 한다.

### 2.2 컴포넌트 구성
- **프론트엔드 SPA**: React 18 + TypeScript + Vite 빌드 산출물 (정적 파일)
- **API 서버**: Node.js 20 LTS + NestJS + Prisma — REST API + 세션 인증
- **DB**: **SQLite (WAL 모드)** — 단일 파일, 단일 인스턴스 전제. 전체 150명 이하 / 읽기 위주 워크로드에서 충분.
- **리버스 프록시**: nginx — TLS 종단, 정적 파일 서빙, `/api` → API 서버
- **백업 워커**: 시스템 cron (일자별) + 관리자 즉시 트리거(API)

### 2.3 기술 스택 (확정)

| 영역 | 채택 |
|---|---|
| 백엔드 | **Node.js 20 LTS + NestJS + Prisma** |
| DB | **SQLite (WAL)** |
| 프론트 | **React 18 + TypeScript + Vite + TanStack Query + Zustand** |
| UI 라이브러리 | **shadcn/ui (Radix + Tailwind)** |
| Timeline 뷰 | **`vis-timeline`** (오프라인 번들; `frappe-gantt` 은 PoC 단계 대체 후보) |
| 배포 | **docker compose + 오프라인 이미지 tar** |

#### 2.3.1 SQLite 운영 주의점
- **WAL 모드 필수** (`journal_mode=WAL`, `synchronous=NORMAL`).
- 단일 writer 제약 → API 서버 단일 인스턴스. 수평 확장 필요 시 PostgreSQL 로 마이그레이션(Prisma 데이터소스 교체).
- Prisma 의 SQLite 제약: `enum` 미지원 → **TypeScript enum + CHECK 제약** 으로 대체 (또는 lookup 테이블).
- 라이브 백업: `sqlite3 .backup` 또는 `VACUUM INTO` 사용 (파일 직접 cp 금지).

---

## 3. 도메인 모델

### 3.1 ERD (개념)

```
┌──────────┐ 1   N ┌─────────────────┐ N   1 ┌──────────┐
│  User    │───────│ ProjectMember   │───────│ Project  │
│          │       │ (role_in_proj)  │       │          │
└──────────┘       └─────────────────┘       └────┬─────┘
                                                   │ 1
                                                   │
                                                   ▼ N
                                            ┌─────────────┐
                                            │ ScheduleNode│  (트리, 최대 5단계)
                                            │ kind: GROUP │
                                            │       │ ITEM│
                                            └──┬───────┬──┘
                                               │ 1     │ 1
                                               ▼ N     ▼ N
                                       ┌──────────┐ ┌──────────┐
                                       │ Comment  │ │ History  │
                                       └──────────┘ └──────────┘
```

### 3.2 테이블 정의

> SQLite 채택에 따라 `uuid` 는 TEXT(36) UUIDv4 문자열, `timestamptz` 는 TEXT ISO-8601(UTC) 로 저장. enum 은 TypeScript 측 union + DB CHECK 제약으로 표현.

**users**
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | TEXT(36) PK | UUIDv4 |
| username | TEXT UNIQUE | 로그인 ID |
| display_name | TEXT | 표시 이름 |
| password_hash | TEXT | argon2id |
| password_must_change | INTEGER(0/1) | 임시 패스워드 발급 시 1 |
| global_role | TEXT CHECK in ('ADMIN','USER') | 시스템 레벨 권한 |
| is_active | INTEGER(0/1) | 비활성화 시 로그인 불가 |
| preferences_json | TEXT NULL | 테마 등 사용자 선호 (JSON) |
| created_at, updated_at, last_login_at | TEXT (ISO-8601) | |

> "Manager / Member" 는 **프로젝트 단위 역할** 이므로 사용자 글로벌 레벨에는 ADMIN/USER 만 둔다.

**projects**
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | TEXT(36) PK | |
| name | TEXT(200) | |
| description | TEXT | |
| status | TEXT CHECK in ('ACTIVE','ARCHIVED') | |
| created_by | TEXT FK users(id) | |
| created_at, updated_at | TEXT (ISO-8601) | |

**project_members**
| 컬럼 | 타입 | 설명 |
|---|---|---|
| project_id | TEXT FK projects(id) | (PK 일부) |
| user_id | TEXT FK users(id) | (PK 일부) |
| role | TEXT CHECK in ('MANAGER','MEMBER') | 프로젝트 내 역할 |
| added_by | TEXT FK users(id) | |
| added_at | TEXT (ISO-8601) | |

**schedule_nodes** (Group/Item 통합 트리)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | TEXT(36) PK | |
| project_id | TEXT FK projects(id) | |
| parent_id | TEXT FK schedule_nodes(id) NULL | NULL 이면 루트 |
| kind | TEXT CHECK in ('GROUP','ITEM') | |
| title | TEXT(300) | |
| description | TEXT NULL | **GROUP/ITEM 모두 허용** |
| start_at | TEXT (DATE, 'YYYY-MM-DD') NULL | **ITEM 만 직접 입력**. GROUP 은 §3.4 자동집계로 산출 |
| end_at | TEXT (DATE, 'YYYY-MM-DD') NULL | 동상 |
| sort_order | INTEGER | 같은 부모 내 정렬 (1,2,3…) |
| depth | INTEGER | **0..4** (최대 5단계). DB CHECK 제약 |
| created_by, updated_by | TEXT FK users(id) | |
| created_at, updated_at | TEXT (ISO-8601) | |

#### 결정 반영 요약 (이 영역)
- **시간 단위**: 날짜(date) 단위. 분기/월 뷰에 적합.
- **GROUP 도 description 보유**.
- **GROUP 의 일정**: 직접 입력하지 않고 **자식 일정의 범위로 자동 집계** (§3.4).
- **트리 깊이**: 최대 **5단계** (`depth` 0~4).
- **GROUP 안에 GROUP 허용**: 깊이 한계 내에서 자유롭게 중첩.

**node_comments**
| id, node_id, author_id, body(TEXT), created_at, updated_at, deleted_at |

**node_history** (변경 이력)
| id, node_id, actor_id, action(CHECK CREATE/UPDATE/MOVE/DELETE/RESTORE), diff_json(TEXT), occurred_at |

- `diff_json` 은 변경된 필드만 `{ field: { from, to } }` 형태로 기록 → 화면에 "사용자 X 가 시작일을 A→B로 변경" 식 표시.

**audit_logs** (시스템 감사 — 로그인/관리자 행위)
| id, actor_id, action, target_type, target_id, ip, user_agent, occurred_at, payload_json |

**sessions** (DB 기반 서버 세션)
| sid PK, user_id, created_at, last_seen_at, expires_at, ip, user_agent |

**확장 포인트 (v1 미사용, 스키마 자리만)**
- `attachments` (파일 첨부)
- `node_dependencies` (선후행 의존)
- `recurrence_rules` (반복 일정)
- `auth_providers` (LDAP 등 외부 인증 추상화)

### 3.3 트리 표현 방식
- **adjacency list (parent_id) + sort_order + depth** 채택.
- 화면 로딩 시 프로젝트 단위 전체 노드 fetch → 클라이언트에서 트리 구성 (5,000건 가정으로 충분).
- 이동(move) API 에서 사이클·깊이 초과·다른 프로젝트로의 이동을 서버에서 검증.
- 대규모 확장 시 materialized path 추가 가능 (확장 포인트 명시).

### 3.4 GROUP 일정 자동 집계 (계산 규칙)
GROUP 의 `start_at` / `end_at` 은 **저장하지 않고 파생값으로 노출**한다.

```
GROUP.start_at = MIN(자손 ITEM 들의 start_at, 자손 GROUP 의 start_at) — 둘 다 null 이면 null
GROUP.end_at   = MAX(자손 ITEM 들의 end_at,   자손 GROUP 의 end_at)   — 둘 다 null 이면 null
```

구현 옵션:
1. **읽기 시 재귀 계산** — 응답에 `start_at_effective` / `end_at_effective` 동봉 (단순, v1 채택)
2. (확장) GROUP 행에 캐시 컬럼 두고 자식 변경 시 위로 propagate

GROUP 자체에는 `description` 만 직접 입력 가능 (설명·메모 용도). 일정 입력 UI 는 GROUP 에서 비활성화하고 자동 집계 결과를 read-only 로 표시.

---

## 4. 인증 / 인가

### 4.1 인증
- **세션 기반** (HttpOnly + Secure + SameSite=Lax 쿠키). JWT 미사용 (관리자 강제 로그아웃 등 제어 용이).
- 패스워드 해싱: **argon2id**.
- 로그인 실패 5회 → 계정 15분 잠금 (감사 로그 기록).
- 비밀번호 정책: 최소 10자, 영문/숫자/특수 중 3종 이상, 동일 username 포함 금지.
- 관리자가 사용자 등록 시 임시 비밀번호 발급 → `password_must_change=1` → 첫 로그인 시 변경 강제.
- 관리자 "패스워드 리셋" 시 동일 플로우.

### 4.2 인가 매트릭스 (확정)

| 행위 | ADMIN | MANAGER (해당 프로젝트) | MEMBER (해당 프로젝트) | 비소속 USER |
|---|---|---|---|---|
| 사용자 생성/비활성/리셋 | O | X | X | X |
| 프로젝트 생성 | O | X | X | X |
| 프로젝트 삭제/백업/복원 | O | X | X | X |
| Manager 지정/해제 | O | X | X | X |
| 프로젝트 멤버 추가/제외 | O | O | X | X |
| 일정 노드 CRUD | **O** | O | O | X |
| 일정 노드 조회 | O | O | O | X (목록에 안 보임) |
| 댓글 작성 | O | O | O | X |
| 댓글 삭제(타인) | O | O | X | X |
| 히스토리 조회 | O | O | O | X |

#### 4.2.1 ADMIN 의 프로젝트 접근 (UX 분리)
권한 모델과 UX 노출은 분리한다.

- **권한 모델**: ADMIN 은 모든 프로젝트의 노드 CRUD 권한을 보유한다.
- **기본 UX**: 일반 사용자 모드의 "내 프로젝트 목록" 에는 ADMIN 본인이 멤버로 포함된 프로젝트만 표시 → 일반 사용자 경험과 동일.
- **관리자 진입**: 헤더의 "관리자 모드" 토글(또는 `/admin` 영역 진입) 시 모든 프로젝트가 보이고, 진입 상태에서는 상단에 띠 배너 ("관리자 모드: 변경이 감사로그에 기록됩니다") 표시.
- **감사로그**: 관리자 모드에서의 모든 변경은 `audit_logs.action='ADMIN_OVERRIDE_EDIT'` 로 별도 기록.

이 설계로, ADMIN 은 자기 자신을 Manager 로 추가하지 않아도 편집 가능하되, **명확한 의도 표시(관리자 모드 진입) + 감사기록** 을 통해 우발적 편집을 막는다.

### 4.3 강제 로그아웃 / 세션 만료 (확정)
- **비활성 30분 자동 만료, 슬라이딩** (요청 시마다 `last_seen_at` / `expires_at` 갱신).
- 절대 만료 12시간 (재로그인 강제).
- 관리자가 사용자를 비활성화하면 해당 user_id 의 모든 세션 즉시 폐기.

---

## 5. API 설계 (REST, 발췌)

기본 prefix: `/api/v1` · 인증 실패 401, 권한 부족 403, 검증 실패 400, 충돌 409.

### 5.1 인증
- `POST /auth/login` `{username, password}` → 세션 쿠키
- `POST /auth/logout`
- `POST /auth/change-password` `{current, next}`
- `GET  /auth/me` → 현재 사용자 + 글로벌 role + 가입 프로젝트 목록 요약

### 5.2 사용자 (ADMIN)
- `GET    /admin/users?query=&status=`
- `POST   /admin/users` `{username, display_name, initial_password}`
- `PATCH  /admin/users/{id}` `{display_name?, is_active?, global_role?}`
- `POST   /admin/users/{id}/reset-password` → 새 임시 비밀번호 반환(화면 1회 표시)

### 5.3 프로젝트
- `GET    /projects` (현재 사용자가 볼 수 있는 것만; 관리자 모드 시 전체)
- `POST   /admin/projects` (ADMIN) `{name, description, manager_user_ids[]}`
- `PATCH  /admin/projects/{id}` (ADMIN)
- `DELETE /admin/projects/{id}` (ADMIN, soft-archive 후 영구삭제 옵션)
- `POST   /admin/projects/{id}/backup` → 백업파일 생성, 다운로드 URL 반환
- `POST   /admin/projects/restore` (multipart) → 백업파일 업로드 후 신규 프로젝트로 복원

### 5.4 프로젝트 멤버
- `GET    /projects/{id}/members`
- `POST   /projects/{id}/members` (MANAGER+) `{user_id, role}`
- `DELETE /projects/{id}/members/{user_id}` (MANAGER+)

### 5.5 일정 노드
- `GET    /projects/{id}/nodes` → 프로젝트 전체 트리 (배열). GROUP 행에는 `start_at_effective` / `end_at_effective` 자동집계 포함
- `POST   /projects/{id}/nodes` `{parent_id?, kind, title, description?, start_at?, end_at?}` (GROUP 은 start/end 무시)
- `PATCH  /nodes/{nodeId}`
- `POST   /nodes/{nodeId}/move` `{new_parent_id, new_sort_order}` — 사이클·깊이>5·타프로젝트 이동 거부
- `DELETE /nodes/{nodeId}` (자손 포함 삭제, 히스토리 보존)
- `GET    /nodes/{nodeId}/comments` · `POST` · `DELETE /comments/{cid}`
- `GET    /nodes/{nodeId}/history`

### 5.6 동시성
- 모든 update 요청에 `If-Match: <updated_at>` 헤더 또는 body 의 `expected_updated_at` 동봉 → 불일치 시 **409 Conflict** 와 현재 서버 값 반환. 클라이언트는 변경 내역 보여주고 사용자 재시도.

---

## 6. 프론트엔드 설계

### 6.1 라우팅
```
/login
/                          → 프로젝트 카드 목록 (내가 속한 프로젝트)
/projects/:id
   ├─ /tree                → 트리 + 테이블 뷰 (기본)
   ├─ /timeline            → Timeline 뷰 (일/주/월/분기 토글)
   ├─ /members             (MANAGER+)
   └─ /history             프로젝트 전체 변경이력
/admin                     (ADMIN, "관리자 모드" 진입 시)
   ├─ /users
   ├─ /projects            → 모든 프로젝트 (배너 표시 상태)
   └─ /backups
/me/password
```

### 6.2 주요 화면

#### 6.2.1 프로젝트 상세 — Tree/Table 뷰
- 좌측: 트리 사이드바 (Group ▶ 펼침/접힘, 드래그&드롭으로 이동). 깊이 5 초과 드롭은 시각적으로 거부.
- 우측: 선택 노드의 상세 패널 (제목/기간/설명/댓글/히스토리). GROUP 의 기간은 자동집계 결과 read-only.
- 상단 도구막대: 새 Group / 새 Item / 검색 / 뷰 전환(Table↔Timeline) / 다크모드 토글
- 테이블 뷰: 트리 들여쓰기로 계층 표현 + 정렬/필터(담당자, 기간, 텍스트 검색)

#### 6.2.2 Timeline 뷰
- 단위 토글: **일 / 주 / 월 / 분기**
- 행: 트리 구조를 평면화하되 GROUP 이 헤더 행으로 표시 (자동집계 막대를 옅은 색으로 표시, 펼침/접힘 동기화)
- 막대: ITEM 의 `start_at ~ end_at`. 드래그로 이동/리사이즈 → 변경 즉시 PATCH (낙관적 업데이트 + 롤백)
- 휠+ctrl 줌, 우측 상단 "오늘로 이동"

#### 6.2.3 ADMIN — 사용자 관리
- 목록(검색/상태 필터) + "사용자 추가" 모달 + 행 액션(비활성/리셋/역할 변경)
- 임시 비밀번호는 발급 직후 1회 표시되는 모달 (복사 버튼) — 서버에는 평문 저장 안 함

#### 6.2.4 ADMIN — 프로젝트 관리
- 프로젝트 카드/표
- "백업 다운로드", "백업 파일로 새 프로젝트 생성", "삭제(아카이브 → 영구삭제)"
- 일자별 자동 백업 현황 (최근 7일분 상태/크기/체크섬)

### 6.3 다크/라이트 모드
- Tailwind `class="dark"` 토글 + `prefers-color-scheme` 자동 감지
- 사용자 설정은 LocalStorage + 서버 `users.preferences_json.theme`

### 6.4 상태/데이터
- 서버 상태: TanStack Query (캐시·낙관적 업데이트·재시도)
- UI 상태: Zustand (트리 펼침, 선택 노드, 뷰 모드, 관리자 모드 토글)

### 6.5 접근성/i18n
- 키보드 내비게이션, ARIA 라벨
- 텍스트는 `i18n/ko.json` 으로 분리 — 영문 등 추가 시 파일 추가만 (v1 출시는 한국어 단일)

---

## 7. 백업 / 복원

### 7.1 일자별 시스템 백업 (필수)
- **트리거**: 시스템 cron, **기본 매일 04:00 KST**. cron 표현은 `.env` 의 `BACKUP_CRON` 으로 변경 가능 (예: `0 4 * * *`).
- **방식**: SQLite `VACUUM INTO '/tmp/app-YYYYMMDD.db'` → gzip → `/var/sam-scheduler/backup/daily/YYYYMMDD/app.db.gz`
- **무결성**: 함께 `app.db.gz.sha256` 생성. 복원 절차 문서에 sha256 검증 단계 포함.
- **보존**: 기본 **30일** (`.env` 의 `BACKUP_RETENTION_DAYS` 로 변경 가능). 초과분은 cron 정리 스크립트로 삭제.
- **모니터링**: API `/api/v1/health/backup` 가 마지막 성공 시각·크기를 반환 → 관리자 화면 표시.

### 7.2 프로젝트 단위 백업
- ADMIN 이 즉시 다운로드 또는 cron 야간 자동 (선택). 결과: `/var/sam-scheduler/backup/projects/YYYYMMDD/<project>.zip`
- 형식: **단일 ZIP** — 내부 `manifest.json` (스키마 버전, 체크섬), `project.json` (프로젝트/멤버/노드/댓글/히스토리)

### 7.3 복원
- ZIP 업로드 → 서버 검증(스키마 버전, sha256) → **새 프로젝트로 생성** (멤버 매핑은 username 기준; 미존재 사용자는 스킵 + 경고 리포트)
- "기존 프로젝트 덮어쓰기" 는 v1 미지원 (안전을 위해)
- 시스템 전체 복원: 서비스 중지 → `app.db.gz` 압축해제 → 파일 교체 → 서비스 시작. 운영 가이드에 절차 명시.

### 7.4 운영 스크립트
- `scripts/full-backup.sh` (즉시 시스템 백업)
- `scripts/restore-system.sh <YYYYMMDD>` (시스템 복원)
- `scripts/cleanup-old-backups.sh --keep-days 30`

---

## 8. 배포 / 운영 (Air-gap)

### 8.1 오프라인 번들 구성
```
sam-scheduler-<version>.tar.gz
 ├─ images/                 # docker save 로 추출한 tar 들
 │   ├─ api.tar             # Node.js + NestJS 앱 (정적 SPA 포함)
 │   └─ nginx.tar
 ├─ compose.yaml
 ├─ .env.example
 ├─ scripts/
 │   ├─ install.sh
 │   ├─ upgrade.sh
 │   ├─ full-backup.sh
 │   ├─ restore-system.sh
 │   └─ cleanup-old-backups.sh
 └─ docs/
     └─ ops-guide.md
```

> SQLite 채택으로 별도 DB 컨테이너 불필요 → 이미지 tar 가 1개 줄어든다.

### 8.2 설치 절차 (요약)
1. `tar xzf sam-scheduler-<v>.tar.gz`
2. `docker load -i images/*.tar`
3. `cp .env.example .env` 후 비밀키/포트/도메인/`INITIAL_ADMIN_*` 편집
4. `docker compose up -d`
5. 첫 기동 시 `.env` 의 `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` 로 **단일 ADMIN** 계정을 시딩하고 첫 로그인 시 패스워드 변경을 강제. v1 운영 가정상 ADMIN 계정은 1개로 충분 — UI 의 사용자 등록은 일반 사용자(`USER`) 만 다룬다 (글로벌 role 변경 API 는 비상시용으로 비공개).
6. 호스트 cron 에 `scripts/full-backup.sh` 등록 (install.sh 가 안내 출력). `BACKUP_CRON` / `BACKUP_RETENTION_DAYS` 는 `.env` 에서 조정.

### 8.3 업그레이드
- 무중단은 v1 미요구. `compose down → docker load → compose up` 패턴.
- DB 마이그레이션은 컨테이너 기동 시 자동 실행 (`prisma migrate deploy`).
- 업그레이드 직전 자동으로 시스템 백업 1회 수행 (스크립트가 강제).

### 8.4 모니터링/로그
- 컨테이너 stdout → 호스트 `journald` (또는 파일 로테이션)
- `/api/v1/health` (DB 파일 존재/오픈 여부 포함)
- `/api/v1/health/backup` (마지막 백업 성공 시각/크기)
- v1 외부 모니터링 연동 없음. 로그 파일 위치만 명시.

---

## 9. 보안 고려사항

- TLS: 사내 사설 CA 인증서 사용 (가이드 문서에 발급 예시 포함)
- CSRF: 세션 쿠키 + `SameSite=Lax` + 상태변경 API 에 CSRF 토큰 헤더
- XSS: React 기본 이스케이프 + Markdown 렌더링은 화이트리스트 sanitizer (DOMPurify)
- SQL Injection: Prisma 파라미터 바인딩 강제, `$queryRaw` 사용 시 리뷰 필수
- 권한: 모든 API 핸들러 진입 시 `(user, project_id)` 권한 체크 미들웨어 필수 (관리자 모드 진입 여부도 함께 검증)
- 감사로그: 로그인 성공/실패, 관리자 행위, 관리자 모드 편집, 프로젝트 삭제/복원 필수 기록
- 비밀번호 정책 + 계정 잠금 (4.1 참조)
- 업로드 파일(백업 ZIP) 크기 제한, MIME 검증, 임시 디렉터리 격리, sha256 검증
- Rate limit: 로그인 IP 당 분당 10회 (가정)
- SQLite 파일 권한: `0600`, 컨테이너 내부 비루트 유저 소유

---

## 10. 디렉터리 구조 (제안)

```
sam-scheduler/
├─ apps/
│  ├─ api/           # NestJS
│  │  ├─ src/
│  │  │  ├─ auth/         users/         projects/
│  │  │  ├─ nodes/        comments/      history/
│  │  │  ├─ admin/        backup/        common/
│  │  │  └─ main.ts
│  │  └─ prisma/
│  │     ├─ schema.prisma   (provider = "sqlite")
│  │     └─ migrations/
│  └─ web/           # React + Vite
│     ├─ src/
│     │  ├─ pages/        components/    features/
│     │  ├─ api/ (TanStack Query hooks)
│     │  └─ stores/
│     └─ index.html
├─ packages/
│  └─ shared/        # zod 스키마, 타입 (api↔web 공유)
├─ deploy/
│  ├─ compose.yaml   nginx.conf   .env.example
│  └─ scripts/
├─ docs/
│  ├─ DESIGN.md  ops-guide.md  api.md
└─ package.json (pnpm workspaces)
```

---

## 11. 개발 로드맵

| 마일스톤 | 기간(예상) | 산출물 |
|---|---|---|
| M0 — 프로젝트 셋업 | 0.5주 | 모노레포(pnpm), 린팅, Prisma+SQLite 셋업, Docker compose 로컬 기동 |
| M1 — 인증/사용자/관리자 | 1.5주 | 로그인, ADMIN 사용자 관리, 패스워드 리셋, 세션(슬라이딩 30분), 감사로그 |
| M2 — 프로젝트 CRUD + 멤버 + 관리자 모드 UX | 1주 | 프로젝트 생성/삭제, 멤버 추가/제외, 관리자 모드 토글 |
| M3 — 일정 트리 + 테이블 뷰 | 2주 | Group/Item CRUD, 트리(adjacency+depth), 테이블, 댓글, 히스토리, GROUP 자동집계 |
| M4 — Timeline 뷰 | 1.5주 | 일/주/월/분기 토글, 드래그 편집, 충돌(409) 처리 UI |
| M5 — 백업/복원 + 다크모드 + 마감 | 1주 | 일자별 시스템 백업(cron), 프로젝트 ZIP 백업/복원, 테마, e2e 테스트 |
| M6 — 오프라인 번들 + 운영문서 | 0.5주 | 배포 패키지(tar), install/upgrade/restore 스크립트, 운영 가이드 |

총 ~ **8주** (1인 풀스택 기준 추정).

#### 확장 포인트 (v1 이후)
- 사내 알림시스템 연동 (§1.3)
- 파일 첨부, 의존성, 반복 일정
- LDAP/AD 연동 (`auth_providers` 추상 인터페이스)
- 다중 인스턴스/HA 필요 시 SQLite → PostgreSQL 마이그레이션 (Prisma datasource 교체)

---

## 12. 결정 이력 (v1.0 동결)

| # | 항목 | 결정 |
|---|---|---|
| ① | 사용자 규모 | 전체 150명 이하 (등록·동시 동일) |
| ② | 비밀번호 정책 | 최소 10자 / 영·숫·특 중 3종 이상 / username 포함 금지 |
| ③ | 세션 절대 만료 | 12시간 (슬라이딩 30분과 별개) |
| ④ | 자동 백업 시각 | 기본 매일 **04:00 KST**, `.env` `BACKUP_CRON` 으로 조정 가능 |
| ⑤ | 백업 보존 기간 | 기본 **30일**, `.env` `BACKUP_RETENTION_DAYS` 로 조정 가능 |
| ⑥ | 초기 ADMIN 시딩 | **환경변수 1회 + 첫 로그인 시 패스워드 변경 강제**. 단일 ADMIN 운영 — UI 의 사용자 등록은 일반 USER 만 다룸 |

---

## 부록 A — 화면 와이어프레임 (텍스트)

### A.1 프로젝트 상세 (Tree+Table)
```
┌─────────────────────────────────────────────────────────────┐
│ SAM Scheduler   [프로젝트A ▼]     🔍 [Search]    🌗  로그아웃│
├──────────────┬──────────────────────────────────────────────┤
│ 트리          │ [Table | Timeline]   + Group   + Item        │
│ ▼ 기획        │ ┌──────────┬────────┬─────────┬───────────┐  │
│   • 요구분석  │ │ 제목     │ 시작   │ 종료    │ 담당      │  │
│   • 와이어프 │ │ ▼ 기획   │ (auto) │ (auto)  │           │  │
│ ▶ 개발        │ │   요구분석│ 04-30 │ 05-10  │ 홍길동    │  │
│ ▶ QA          │ │   와이어 │ 05-01 │ 05-08  │ 김설계    │  │
│               │ │ ▶ 개발   │ (auto) │ (auto) │           │  │
│               │ └──────────┴────────┴─────────┴───────────┘  │
│               │ ────── 선택 항목 상세 ─────────────────────  │
│               │  제목 / 기간 / 설명 / 댓글 / 히스토리         │
└──────────────┴──────────────────────────────────────────────┘
```

### A.2 Timeline 뷰
```
[일 | 주 | 월 | 분기]                                [오늘]
        04-28  04-29  04-30  05-01  05-02  05-03 ...
기획     ░░░░░░░░░░░░░░░░░░░░       ← 자동집계(옅은 색)
  요구분석   ██████████
  와이어프    ████████
개발              ░░░░░░░░░░░░░░░░░░
QA                            ██████
```

### A.3 관리자 모드 진입 배너
```
┌─────────────────────────────────────────────────────────────┐
│ ⚠ 관리자 모드 — 변경 사항은 감사로그에 기록됩니다  [종료]    │
├─────────────────────────────────────────────────────────────┤
│ (이하 일반 화면)                                             │
```

---

*문서 끝.*
