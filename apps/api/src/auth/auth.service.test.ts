import { describe, expect, it, vi } from 'vitest';
import * as bcrypt from 'bcryptjs';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SessionsService } from '../sessions/sessions.service';
import type { AuditService } from '../audit/audit.service';
import type { RateLimitService } from '../common/rate-limit';

/**
 * 해싱을 argon2 → bcrypt 로 바꾼 커밋(017bca7) 이후, 그 전에 만들어진 계정은 DB 에 argon2id
 * 해시를 그대로 갖고 있다. bcryptjs 는 argon2 해시를 받으면 예외도 없이 false 를 돌려주므로
 * **어떤 비밀번호를 넣어도 로그인이 실패**했다 (admin 포함 전 계정). 그 회귀를 막는 테스트다.
 */

const PASSWORD = 'CorrectHorse!42';

interface FakeUserRow {
  id: string;
  username: string;
  passwordHash: string;
  isActive: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
  passwordMustChange: boolean;
  lastLoginAt: Date | null;
}

/** login() 이 건드리는 최소한의 협력자만 세운다. update 로 넘어온 data 를 그대로 받아둔다. */
function buildService(row: FakeUserRow) {
  const updates: Array<Record<string, unknown>> = [];
  const auditEntries: Array<Record<string, unknown>> = [];

  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(row),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { ...row, ...data };
      }),
    },
  } as unknown as PrismaService;

  const sessions = {
    sweepExpiredForUser: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({ sid: 'sid-1', expiresAt: new Date('2026-08-02T00:00:00Z') }),
  } as unknown as SessionsService;

  const audit = {
    log: vi.fn(async (entry: Record<string, unknown>) => {
      auditEntries.push(entry);
    }),
  } as unknown as AuditService;

  const rateLimit = { check: vi.fn().mockReturnValue(true) } as unknown as RateLimitService;

  return {
    service: new AuthService(prisma, sessions, audit, rateLimit),
    updates,
    auditEntries,
  };
}

function makeRow(passwordHash: string): FakeUserRow {
  return {
    id: 'user-1',
    username: 'admin',
    passwordHash,
    isActive: true,
    failedLoginCount: 12,
    lockedUntil: null,
    passwordMustChange: false,
    lastLoginAt: null,
  };
}

describe('AuthService.login — 해시 포맷 혼재 처리', () => {
  it('옛 argon2id 해시로 저장된 계정도 기존 비밀번호로 로그인된다', async () => {
    const legacyHash = await argon2.hash(PASSWORD);
    const { service } = buildService(makeRow(legacyHash));

    const result = await service.login('admin', PASSWORD, {});

    expect(result.sid).toBe('sid-1');
  });

  it('argon2 해시로 로그인하면 그 자리에서 bcrypt 해시로 갈아치운다', async () => {
    const legacyHash = await argon2.hash(PASSWORD);
    const { service, updates, auditEntries } = buildService(makeRow(legacyHash));

    await service.login('admin', PASSWORD, {});

    // 성공 시 카운터를 초기화하는 그 UPDATE 한 번에 새 해시가 함께 실려야 한다.
    expect(updates).toHaveLength(1);
    const written = updates[0]!['passwordHash'];
    expect(typeof written).toBe('string');
    expect(written as string).toMatch(/^\$2[aby]\$/);
    // 갈아치운 해시로도 같은 비밀번호가 통해야 한다 (재해싱이 평문을 잘못 옮기지 않았는지).
    await expect(bcrypt.compare(PASSWORD, written as string)).resolves.toBe(true);

    const success = auditEntries.find((e) => e['action'] === 'LOGIN_SUCCESS');
    expect(success?.['payload']).toEqual({ passwordRehashed: 'argon2id->bcrypt' });
  });

  it('argon2 해시라도 비밀번호가 틀리면 실패하고 해시를 건드리지 않는다', async () => {
    const legacyHash = await argon2.hash(PASSWORD);
    const { service, updates } = buildService(makeRow(legacyHash));

    await expect(service.login('admin', 'WrongPassword!1', {})).rejects.toThrow();

    // 실패 카운터만 오르고 passwordHash 는 그대로여야 한다.
    expect(updates).toHaveLength(1);
    expect(updates[0]).not.toHaveProperty('passwordHash');
  });

  it('이미 bcrypt 해시인 계정은 재해싱하지 않는다', async () => {
    const bcryptHash = await bcrypt.hash(PASSWORD, 10);
    const { service, updates, auditEntries } = buildService(makeRow(bcryptHash));

    await service.login('admin', PASSWORD, {});

    expect(updates).toHaveLength(1);
    expect(updates[0]).not.toHaveProperty('passwordHash');
    const success = auditEntries.find((e) => e['action'] === 'LOGIN_SUCCESS');
    expect(success).not.toHaveProperty('payload');
  });

  it('bcryptjs 는 argon2 해시를 받으면 예외 없이 false 를 준다 (버그의 원인)', async () => {
    const legacyHash = await argon2.hash(PASSWORD);
    await expect(bcrypt.compare(PASSWORD, legacyHash)).resolves.toBe(false);
  });
});

describe('AuthService.changePassword — 옛 해시 사용자도 비밀번호를 바꿀 수 있다', () => {
  it('현재 비밀번호가 argon2 해시로 저장돼 있어도 검증을 통과한다', async () => {
    const legacyHash = await argon2.hash(PASSWORD);
    const row = makeRow(legacyHash);
    const { service, updates } = buildService(row);

    await service.changePassword(row.id, PASSWORD, 'BrandNew!Pass99', {});

    expect(updates).toHaveLength(1);
    expect(updates[0]!['passwordHash'] as string).toMatch(/^\$2[aby]\$/);
    expect(updates[0]!['passwordMustChange']).toBe(false);
  });
});
