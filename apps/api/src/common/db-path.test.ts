import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveDatabaseUrl, resolveDbFilePath } from './db-path';

describe('resolveDatabaseUrl', () => {
  const original = process.env.DATABASE_URL;
  let cwd: string;
  let prevCwd: string;

  beforeEach(() => {
    prevCwd = process.cwd();
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-dbpath-'));
    process.chdir(cwd);
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    process.chdir(prevCwd);
    if (original === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = original;
    }
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('DATABASE_URL 이 있으면 그대로 쓴다', () => {
    process.env.DATABASE_URL = 'file:/tmp/custom.db';
    expect(resolveDatabaseUrl()).toBe('file:/tmp/custom.db');
  });

  it('없으면 cwd/data/sam.db 로 만든다', () => {
    const url = resolveDatabaseUrl();
    expect(url.startsWith('file:')).toBe(true);
    expect(url.endsWith('/data/sam.db')).toBe(true);
  });

  it('data 디렉터리를 만들어 둔다', () => {
    resolveDatabaseUrl();
    expect(fs.existsSync(path.join(cwd, 'data'))).toBe(true);
  });

  it('경로 구분자를 슬래시로 정규화한다 (Prisma 요구사항)', () => {
    expect(resolveDatabaseUrl()).not.toContain('\\');
  });
});

describe('resolveDbFilePath', () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = original;
    }
  });

  it('file: 접두어를 뗀 경로를 준다', () => {
    process.env.DATABASE_URL = 'file:/tmp/custom.db';
    expect(resolveDbFilePath()).toBe('/tmp/custom.db');
  });
});
