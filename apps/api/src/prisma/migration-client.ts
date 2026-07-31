import { PrismaClient } from '@prisma/client';

/**
 * datasource URL 에 connection_limit=1 을 붙인다.
 *
 * PRAGMA(foreign_keys=OFF, defer_foreign_keys 등)는 커넥션 단위로 적용되는데, 마이그레이션
 * 적용에 쓰는 $executeRawUnsafe 는 매번 Prisma 커넥션 풀에서 커넥션을 꺼내 쓴다. 풀에
 * 커넥션이 둘 이상이면 마이그레이션 SQL 안의 "PRAGMA foreign_keys=OFF" 문장과 뒤따르는
 * "DROP TABLE" 문장이 서로 다른 커넥션에서 실행될 수 있고, 그러면 FK 가 여전히 켜진 채로
 * DROP TABLE 의 암묵적 DELETE 가 실행되어 ON DELETE CASCADE 가 발동, node_comments /
 * node_history 같은 자식 레코드가 조용히 삭제된다 — 마이그레이션 자체는 "성공"으로 보고된다.
 * 단일 커넥션으로 고정해 이 경로를 원천적으로 막는다.
 * (apps/api/src/prisma/test-helpers.ts 의 createTempDb() 와 같은 이유, 같은 처리.)
 *
 * export 하는 이유: process.env.DATABASE_URL 에는 이 값이 절대 섞이면 안 된다
 * (migrate-main.ts 의 runMigrate() 주석 참고) — 향후 실수로 그 경계가 무너지지 않도록
 * 이 함수 자체와 양쪽 분기를 테스트로 고정한다.
 */
export function withSingleConnection(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}connection_limit=1`;
}

/**
 * 마이그레이션 적용 전용 PrismaClient 를 만든다.
 *
 * `applyMigrations()` 의 docstring 이 "호출자는 반드시 connection_limit=1 로 고정한 client 를
 * 넘겨야 한다" 고 요구하는 불변식을, 주석이 아니라 **생성 경로 하나로** 강제하기 위한 함수다.
 * 예전에는 migrate-main.ts 만 이 규칙을 지키고 PrismaService 는 자기 자신(`this`, 풀 크기
 * 기본값)을 그대로 넘기고 있었다. 그때의 근거는 "sp-server.exe 는 빈 DB 에만 적용하므로
 * DROP TABLE 의 CASCADE 가 지울 자식 레코드가 애초에 없다" 였는데, 이는 현재 마이그레이션
 * 목록에서만 성립하는 우연이다 — seed 마이그레이션(20260714121735_seed_initial_autocomplete)
 * 뒤에 테이블을 재정의(RedefineTables)하는 마이그레이션이 하나라도 추가되면, 빈 DB 초기화
 * 경로에서도 지울 데이터가 존재하게 되어 같은 결함이 조용히 되살아난다.
 *
 * 그래서 `applyMigrations()` 를 호출하는 모든 지점은 이 함수로 만든 client 를 쓴다.
 */
export function createMigrationClient(url: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: withSingleConnection(url) } },
  });
}
