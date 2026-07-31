import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // scripts/ 도 포함한다 — sp-backup.exe 의 순수 로직(scripts/backup-cli-lib.ts)이 여기 있다.
    // 그 파일이 src/ 로 못 가는 이유는 backup-cli-lib.ts 앞머리 주석 참고 (별도 tsc 컴파일).
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // 실제 SQLite 파일을 다루는 통합 테스트가 있어 병렬 파일 간 간섭을 막는다.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
