---
name: sam-troubleshooting
description: SAM Scheduler에서 자주 터지는 빌드·개발환경 문제의 원인과 해결책. SQLite `database is locked`(P2002/P2010), TypeScript incremental 캐시로 인한 `Cannot find module '.../dist/main'`, `@sam/shared` 모듈 타입을 못 가져오는 에러, shared에 새 export를 추가한 뒤 웹 화면이 아무 에러 없이 빈 화면으로 뜨는 vite deps 캐시 문제를 다룬다. prisma migrate가 락에 걸리거나, 분명히 고쳤는데 옛날 빌드가 돌거나, 특정 페이지만 하얗게 뜰 때 사용한다.
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
