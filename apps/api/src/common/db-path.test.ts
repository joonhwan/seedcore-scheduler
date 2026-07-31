import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseDotEnvValue, resolveDatabaseUrl, resolveDbFilePath } from './db-path';

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

describe('parseDotEnvValue', () => {
  it('KEY=value 형태를 그대로 읽는다', () => {
    expect(parseDotEnvValue('DATABASE_URL=file:./a.db', 'DATABASE_URL')).toBe('file:./a.db');
  });

  it('큰따옴표로 감싼 값의 따옴표를 제거한다', () => {
    expect(parseDotEnvValue('DATABASE_URL="file:./a.db"', 'DATABASE_URL')).toBe('file:./a.db');
  });

  it("작은따옴표로 감싼 값의 따옴표를 제거한다", () => {
    expect(parseDotEnvValue("DATABASE_URL='file:./a.db'", 'DATABASE_URL')).toBe('file:./a.db');
  });

  it('줄 앞뒤 공백과 = 주변 공백을 제거한다', () => {
    expect(parseDotEnvValue('  DATABASE_URL = file:./a.db  ', 'DATABASE_URL')).toBe('file:./a.db');
  });

  it('export 접두어를 허용한다', () => {
    expect(parseDotEnvValue('export DATABASE_URL=file:./a.db', 'DATABASE_URL')).toBe('file:./a.db');
  });

  it('주석 처리된 줄은 무시한다', () => {
    expect(parseDotEnvValue('# DATABASE_URL=file:./nope.db', 'DATABASE_URL')).toBeUndefined();
  });

  it('같은 키가 여러 번 나오면 처음 값을 쓴다', () => {
    const contents = 'DATABASE_URL=file:./first.db\nDATABASE_URL=file:./second.db';
    expect(parseDotEnvValue(contents, 'DATABASE_URL')).toBe('file:./first.db');
  });

  it('빈 값이면 undefined 를 준다', () => {
    expect(parseDotEnvValue('DATABASE_URL=', 'DATABASE_URL')).toBeUndefined();
  });

  it('다른 키만 있으면 undefined 를 준다', () => {
    expect(parseDotEnvValue('OTHER_KEY=value', 'DATABASE_URL')).toBeUndefined();
  });

  it('키 이름이 부분 일치하는 경우 오탐하지 않는다', () => {
    expect(parseDotEnvValue('MY_DATABASE_URL=file:./wrong.db', 'DATABASE_URL')).toBeUndefined();
  });
});

describe('resolveDatabaseUrl - .env 반영', () => {
  const original = process.env.DATABASE_URL;
  let cwd: string;
  let prevCwd: string;

  beforeEach(() => {
    prevCwd = process.cwd();
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-dbpath-env-'));
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

  it('process.env.DATABASE_URL 이 설정돼 있으면 .env 가 있어도 그것을 쓴다', () => {
    fs.writeFileSync(path.join(cwd, '.env'), 'DATABASE_URL="file:./data/app.db"\n');
    process.env.DATABASE_URL = 'file:/explicit/env-var.db';
    expect(resolveDatabaseUrl()).toBe('file:/explicit/env-var.db');
  });

  it('process.env 가 비어 있고 .env 에 값이 있으면 .env 값을 그대로 돌려준다 (절대경로화 금지)', () => {
    fs.writeFileSync(path.join(cwd, '.env'), 'DATABASE_URL="file:./data/app.db"\n');
    expect(resolveDatabaseUrl()).toBe('file:./data/app.db');
  });

  it('.env 값을 쓸 때는 data 디렉터리를 만들지 않는다', () => {
    fs.writeFileSync(path.join(cwd, '.env'), 'DATABASE_URL=file:./data/app.db\n');
    resolveDatabaseUrl();
    expect(fs.existsSync(path.join(cwd, 'data'))).toBe(false);
  });

  it('.env 가 없으면 기존 폴백으로 가고 data 디렉터리를 만든다', () => {
    const url = resolveDatabaseUrl();
    expect(url.startsWith('file:')).toBe(true);
    expect(url.endsWith('/data/sam.db')).toBe(true);
    expect(fs.existsSync(path.join(cwd, 'data'))).toBe(true);
  });
});
