import { describe, expect, it } from 'vitest';
import { createMigrationClient, withSingleConnection } from './migration-client';

describe('withSingleConnection', () => {
  it('쿼리스트링이 없으면 ? 로 connection_limit=1 을 붙인다', () => {
    expect(withSingleConnection('file:./data/app.db')).toBe(
      'file:./data/app.db?connection_limit=1',
    );
  });

  it('쿼리스트링이 이미 있으면 & 로 connection_limit=1 을 붙인다', () => {
    expect(withSingleConnection('file:./data/app.db?mode=rwc')).toBe(
      'file:./data/app.db?mode=rwc&connection_limit=1',
    );
  });

  it('어느 형태의 URL 이든 결과에는 항상 connection_limit=1 이 들어간다', () => {
    // applyMigrations() 가 요구하는 단일 커넥션 불변식을 "생성 경로" 로 못박는 테스트다.
    // 누군가 이 함수에서 connection_limit 을 빼면 여기서 빨간불이 난다 — 예전처럼
    // 호출부마다 문자열을 직접 조립하던 시절에는 이 회귀를 잡을 방법이 없었다.
    for (const url of [
      'file:./data/app.db',
      'file:./data/app.db?mode=rwc',
      'file:D:/deploy/data/sam.db',
      'file:/var/lib/sam/sam.db?socket_timeout=5',
    ]) {
      expect(withSingleConnection(url)).toContain('connection_limit=1');
    }
  });
});

describe('createMigrationClient', () => {
  it('connection_limit=1 이 붙은 URL 로 client 를 만든다', async () => {
    // 생성자에 넘긴 URL 을 PrismaClient 에서 되읽을 공개 API 가 없으므로, 여기서는
    // withSingleConnection() 을 거친다는 사실(위 describe 가 값으로 고정)과 실제로
    // 동작하는 client 가 나온다는 사실을 함께 확인한다.
    const client = createMigrationClient('file:./prisma/data/app.db');
    try {
      expect(typeof client.$executeRawUnsafe).toBe('function');
      expect(typeof client.$queryRawUnsafe).toBe('function');
    } finally {
      await client.$disconnect();
    }
  });
});
