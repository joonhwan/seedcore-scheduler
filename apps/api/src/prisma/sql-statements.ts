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
    //
    // 개행을 직접 붙이는 이유: 아래 while 은 '\n' 을 만나면 멈추지만, continue 로 돌아가면
    // for 의 i += 1 이 그 '\n' 을 건너뛰어 결과 문장에서 사라진다. 그러면 "SELECT 1--c\nFROM t"
    // 같은 입력이 "SELECT 1FROM t" 로 붙어버린다 (주석 앞에 공백이 없는 경우). 현재
    // 마이그레이션 파일은 주석이 항상 자기 줄에 있어 문제가 드러나지 않지만, 앞으로 손으로
    // 쓴 SQL 이 들어오면 바로 깨진다. 문장은 마지막에 trim 하므로 개행을 남겨도 손해가 없다.
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        i += 1;
      }
      if (i < sql.length) {
        current += '\n';
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
