/**
 * migration.sql 을 개별 실행 가능한 문장 배열로 나눈다.
 *
 * Prisma 의 $executeRawUnsafe 는 한 번에 한 문장만 허용하므로 파일을 쪼개야 한다.
 * 세미콜론 단순 분리로는 부족하다. 문자열 리터럴 안의 세미콜론에서 잘리면
 * seed 성격의 마이그레이션(일정 제목 등 한글 데이터)이 깨진다.
 *
 * SQLite 의 문자열 escape 는 '' (작은따옴표 두 번) 이다.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];

    if (inString) {
      current += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          // '' 는 escape 된 작은따옴표. 문자열은 계속된다.
          current += sql[i + 1];
          i += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }

    if (ch === "'") {
      inString = true;
      current += ch;
      continue;
    }

    // -- 부터 줄 끝까지는 주석. 개행은 남겨 문장 모양을 보존한다.
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        i += 1;
      }
      continue;
    }

    if (ch === ';') {
      pushStatement(statements, current);
      current = '';
      continue;
    }

    current += ch;
  }

  pushStatement(statements, current);
  return statements;
}

function pushStatement(target: string[], raw: string): void {
  const trimmed = raw.trim();
  if (trimmed.length > 0) {
    target.push(trimmed);
  }
}
