---
name: sam-troubleshooting
description: SAM Scheduler에서 자주 터지는 빌드·개발환경 문제의 원인과 해결책. SQLite `database is locked`(P2002/P2010), TypeScript incremental 캐시로 인한 `Cannot find module '.../dist/main'`, `@sam/shared` 모듈 타입을 못 가져오는 에러, shared에 새 export를 추가한 뒤 웹 화면이 아무 에러 없이 빈 화면으로 뜨는 vite deps 캐시 문제를 다룬다. api 에 같은 필드 이름을 두고 TS 에러가 수십 건 쏟아지는(생성된 Prisma Client 가 낡은) 문제도 다룬다. prisma migrate가 락에 걸리거나, 분명히 고쳤는데 옛날 빌드가 돌거나, 특정 페이지만 하얗게 뜨거나, CI 는 통과하는데 로컬 빌드만 깨질 때 사용한다.
---

# SAM Scheduler — 자주 만나는 문제 및 트러블슈팅

> 이 문서는 원래 `AGENTS.md` §5였습니다. 매 세션 상주시킬 필요가 없어 스킬로 분리했습니다.

## 1. SQLite `database is locked` (P2002 / P2010 등)
- **원인**: SQLite는 단일 Writer 구조를 가집니다. 개발 서버(`pnpm dev`)가 켜져 있어 DB 접속 핸들을 쥐고 있는 상태에서 터미널을 통해 `prisma migrate dev`를 수행하면 데이터베이스 락이 발생합니다.
- **해결**: 마이그레이션 명령어를 돌릴 때는 **반드시 임시로 개발 서버를 종료**한 뒤 수행하시기 바랍니다.

## 2. TypeScript incremental 캐시 컴파일 오류
- **증상**: 코드를 분명히 수정했음에도 `Cannot find module '.../dist/main'` 또는 이전 컴파일 버전의 빌드가 적용되어 런타임 에러가 발생하는 경우.
- **해결**: `apps/api/tsconfig.json` 파일의 `incremental` 설정이 `false`인지 확인하고, `apps/api/tsconfig.tsbuildinfo` 파일과 `apps/api/dist` 디렉터리를 수동으로 삭제한 뒤 빌드를 재수행하십시오.

## 3. Shared 패키지 가져오기 실패
- **증상**: 프론트엔드나 백엔드에서 `@sam/shared` 모듈의 타입을 가져올 수 없다는 에러 발생.
- **해결**: 패키지 간의 가벼운 의존성 관리를 위해 `tsconfig.base.json`의 `paths`는 제거되어 있습니다. 반드시 로컬 개발 전 `pnpm -F @sam/shared build`를 먼저 수행하여 패키지 내 `dist` 폴더를 컴pile해야 빌드 도구(Vite, NestJS)가 정상적으로 모듈을 해석할 수 있습니다.

## 4. Shared 에 새 export 를 추가한 뒤 웹 화면이 빈 화면으로 뜬다
- **증상**: `packages/shared` 에 새 함수·스키마를 추가하고 그것을 쓰는 페이지로 들어가면 **아무 에러 메시지 없이 화면이 하얗게(또는 검게) 비어 있음.** 다른 페이지는 정상. `pnpm -r typecheck` 와 테스트는 전부 통과하고, vite 콘솔에도 빌드 에러가 없어서 코드 버그로 착각하기 쉽습니다.

- **원인**: vite 의 의존성 사전 번들링 캐시(`apps/web/node_modules/.vite/deps/@sam_shared.js`)가 낡은 것입니다.
  이 캐시는 **lockfile 과 vite 설정의 해시로만 무효화**되며, 워크스페이스로 링크된 `packages/shared/dist` 가
  새로 빌드된 것은 감지하지 않습니다. 개발 서버를 띄운 뒤에 shared 에 새 export 를 추가하면
  캐시에는 그 심볼이 없는 상태로 남습니다.

  `@sam/shared` 는 CJS 출력이라 vite 가 named import 를 **속성 접근**으로 변환합니다.

  ```js
  // vite 가 변환한 결과
  const findDateSpan = __vite__cjsImport5__sam_shared["findDateSpan"];
  ```

  캐시에 그 심볼이 없으면 로드 시점에 에러가 나지 않고 조용히 `undefined` 가 됩니다. 그래서 렌더 중
  `findDateSpan(...)` 을 호출하는 순간 `TypeError` 로 컴포넌트 트리가 죽고, 원인 지점(임포트)이 아니라
  한참 뒤(호출)에서 터집니다. ESM 이라면 `does not provide an export named ...` 로 즉시 알려줍니다.

- **해결**: 캐시를 지우고 개발 서버를 재시작합니다.

  ```bash
  rm -rf apps/web/node_modules/.vite && pnpm dev
  ```

  vite 만 따로 띄운다면 `pnpm -F @sam/web exec vite --force` 도 같은 효과입니다.

- **주의**: 루트에서 `pnpm dev --force` 는 통하지 않습니다. 루트 `dev` 스크립트가
  `pnpm -r --parallel --filter "./apps/**" run dev` 라서 `--force` 가 **pnpm 자신의 플래그로 먹히고**
  (pnpm 에도 동명의 옵션이 있습니다) vite 까지 전달되지 않습니다. `--` 로 넘겨도 중간 pnpm 이 가로챕니다.

- **기억할 규칙**: shared 에 **새 이름(export)** 이 생기면 `.vite` 를 지운다. 기존 함수의 내용만 바꾼
  경우에는 캐시가 심볼 목록을 이미 갖고 있으므로 `pnpm -F @sam/shared build` 만으로 반영됩니다.

- **근본 해결(미적용)**: shared 를 ESM/CJS dual output 으로 바꾸면 vite 가 사전 번들링 없이 소스로
  취급해 이 캐시가 개입하지 않고, 심볼 누락도 즉시 에러로 드러납니다. 단 `apps/api`(NestJS, CJS)가
  같은 `dist` 를 쓰므로 `package.json` 의 `exports` 를 import/require 로 분리해야 합니다.

## 5. api 에 TS 에러가 수십 건 쏟아지고 죄다 같은 필드 이름이다 (Prisma Client 가 낡음)

- **증상**: `nest build` 나 `pnpm -F @sam/api typecheck` 가 TS 에러 수십 건으로 죽는데, 전부 같은 필드
  이름 하나(예: `retiredAt`)를 두고 "그런 속성이 없다"(TS2339) / "알 수 없는 속성"(TS2353) / "인자를
  할당할 수 없다"(TS2345)를 말합니다. 어떤 에러는 "'retiredAt' is declared here" 라며 **우리 소스를**
  가리켜서 코드가 자기모순인 것처럼 보입니다. **CI 는 통과하고 로컬만 깨집니다.**

  같은 원인의 다른 얼굴: 에러가 TS2305 / TS7006 으로 나오고 타입이 죄다 `any` 라면, 클라이언트가
  낡은 게 아니라 `export declare const PrismaClient: any` **스텁**으로 되돌아간 것입니다
  (`pnpm install --force` 등으로 node_modules 를 갈아엎은 뒤). 해결은 같습니다.

- **원인**: 생성된 Prisma Client 가 `schema.prisma` 보다 낡았습니다. `node_modules/.prisma/client` 는
  `pnpm install` 이 복원해 주는 게 아니라 `apps/api/scripts/postinstall.js` 가 만드는 **생성물**이고,
  갱신 시점이 install 하나뿐입니다. 그런데 **락파일이 최신이면 pnpm 은 할 일이 없다고 판단해
  postinstall 을 아예 건너뜁니다.** 그래서 "install 을 다시 해 보기" 로는 고쳐지지 않습니다.

  CI(`ci.yml`)가 통과하는 이유는 깨끗한 러너에서 매번 `pnpm install --frozen-lockfile` 을 돌려
  postinstall 이 반드시 실행되기 때문입니다. 뒤처지는 것은 언제나 로컬 node_modules 쪽입니다.

- **확인**: 에러 메시지가 범인의 경로를 찍어 줍니다. 그 파일에서 새 필드 이름을 세어 0 이면 확정입니다.

  ```bash
  grep -c retiredAt node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/index.d.ts
  ```

- **해결**: dev 서버를 끄고 (켜져 있으면 `query_engine-windows.dll.node` 가 잠겨 EPERM)

  ```bash
  pnpm -F @sam/api prisma:generate
  ```

- **개발 DB 도 같이 밀렸는지 본다**: 클라이언트가 낡았다는 건 보통 스키마가 바뀐 뒤 아무것도 안
  돌렸다는 뜻이라, DB 에 마이그레이션도 안 들어가 있을 확률이 높습니다. 그 상태로 `pnpm dev` 를
  띄우면 런타임에 `no such column` 으로 깨집니다.

  ```bash
  pnpm -F @sam/api prisma:migrate:deploy   # 밀린 마이그레이션 적용
  pnpm -F @sam/api prisma:generate         # deploy 는 generate 를 하지 않는다
  ```

  `prisma migrate dev` 는 저 둘을 한 번에 하지만 **시드 스크립트까지 돌립니다.** 데이터가 들어 있는
  개발 DB 에는 `deploy` + `generate` 조합을 쓰십시오.

  DB 를 백업해 둘 때는 **`app.db` 만 복사하면 안 됩니다.** WAL 모드라 최근 쓰기가 `app.db-wal` 에
  들어 있어서, 본체만 복사하면 에러 하나 없이 최근 데이터가 빠집니다. `-wal`·`-shm` 을 같은 이름으로
  짝 맞춰 복사하십시오 (`sp-backup.exe` 와 서버 스케줄러는 이미 그렇게 하고 있습니다 —
  각각 사이드카 복사와 `VACUUM INTO`).

- **릴리스 빌드는 자동입니다**: 커밋 `6291e44` 이후 `build-exe.js` 의 1/7 단계가 generate 를 직접
  부릅니다(108ms). 스키마가 바뀐 뒤 낡은 클라이언트가 exe 에 박히는 일을 막기 위한 것입니다 —
  새 필드를 코드에서 아직 쓰지 않는 시점이었다면 TS 에러도 없이 조용히 잘못된 exe 가 나옵니다.
