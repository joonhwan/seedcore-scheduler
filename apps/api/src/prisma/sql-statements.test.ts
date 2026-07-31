import { describe, expect, it } from 'vitest';
import { splitSqlStatements } from './sql-statements';

describe('splitSqlStatements', () => {
  it('세미콜론으로 문장을 나눈다', () => {
    expect(splitSqlStatements('SELECT 1; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('마지막 세미콜론이 없어도 마지막 문장을 살린다', () => {
    expect(splitSqlStatements('SELECT 1; SELECT 2')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('여러 줄에 걸친 단일 문장을 하나로 유지한다', () => {
    const sql = 'INSERT INTO t (a, b)\nVALUES\n  (1, 2),\n  (3, 4);';
    expect(splitSqlStatements(sql)).toEqual(['INSERT INTO t (a, b)\nVALUES\n  (1, 2),\n  (3, 4)']);
  });

  it('문자열 리터럴 안의 세미콜론에서 자르지 않는다', () => {
    const sql = "INSERT INTO t (a) VALUES ('x; y'); SELECT 1;";
    expect(splitSqlStatements(sql)).toEqual([
      "INSERT INTO t (a) VALUES ('x; y')",
      'SELECT 1',
    ]);
  });

  it("'' 로 escape 된 작은따옴표를 문자열의 끝으로 오해하지 않는다", () => {
    const sql = "INSERT INTO t (a) VALUES ('it''s; ok'); SELECT 1;";
    expect(splitSqlStatements(sql)).toEqual([
      "INSERT INTO t (a) VALUES ('it''s; ok')",
      'SELECT 1',
    ]);
  });

  it('-- 라인 주석을 제거한다', () => {
    const sql = '-- RedefineTables\nSELECT 1;\n-- another; comment\nSELECT 2;';
    expect(splitSqlStatements(sql)).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('주석을 지우면서 그 줄의 개행은 남긴다 (앞 토큰과 뒷 토큰이 붙지 않는다)', () => {
    // 주석 앞에 공백이 없으면 개행까지 삼켰을 때 "SELECT 1FROM t" 로 붙어버린다.
    const sql = 'SELECT 1--c\nFROM t;';
    expect(splitSqlStatements(sql)).toEqual(['SELECT 1\nFROM t']);
  });

  it('빈 문장과 공백만 있는 문장은 버린다', () => {
    expect(splitSqlStatements('SELECT 1;;\n\n  ;SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('PRAGMA 문장을 그대로 보존한다', () => {
    const sql = 'PRAGMA foreign_keys=OFF;\nDROP TABLE "t";\nPRAGMA foreign_keys=ON;';
    expect(splitSqlStatements(sql)).toEqual([
      'PRAGMA foreign_keys=OFF',
      'DROP TABLE "t"',
      'PRAGMA foreign_keys=ON',
    ]);
  });
});
