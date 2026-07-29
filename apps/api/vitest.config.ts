import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // 실제 SQLite 파일을 다루는 통합 테스트가 있어 병렬 파일 간 간섭을 막는다.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
