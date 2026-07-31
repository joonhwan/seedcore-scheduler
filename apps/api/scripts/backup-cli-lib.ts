import * as fs from 'fs';
import * as path from 'path';

/**
 * sp-backup.exe 의 순수 로직 모음.
 *
 * 왜 파일을 나눴는가: `backup-cli.ts` 는 마지막 줄에서 `main()` 을 바로 호출한다. 그 파일을
 * 테스트에서 import 하면 그 자리에서 CLI 가 실행되어 버린다. `require.main === module` 로
 * 감싸는 흔한 방법은 여기서 쓸 수 없다 — ncc(webpack) 번들 안에서는 그 비교가 참이 되지
 * 않아서, exe 가 아무 일도 하지 않고 끝나는 최악의 회귀가 된다. 그래서 부작용 없는 부분만
 * 이 파일로 빼고, `backup-cli.ts` 는 이 파일을 부르는 얇은 껍데기로 둔다.
 *
 * `../src/` 를 import 하지 않는 이유(중요): 이 두 파일은 `build-exe.js` 가 별도의
 * `npx tsc scripts/...` 로 컴파일한다. `../src/` 를 참조하는 순간 tsc 가 추론하는 rootDir 이
 * `apps/api` 로 올라가 산출물 경로가 `dist/scripts/backup-cli.js` 에서 어긋나고, 그 경로를
 * 그대로 쓰는 ncc 진입점이 깨진다 (설계 문서 4절 — `migrate-main.ts` 가 `scripts/` 가 아니라
 * `src/` 에 있는 이유도 같다). 그래서 잠금 파일 판정 로직은 `src/common/process-lock.ts` 를
 * 재사용하지 못하고 여기서 최소한만 다시 구현한다. 둘 중 하나를 고칠 때는 다른 쪽도 함께
 * 확인해야 한다.
 */

/** DB 파일 옆에 생기는 SQLite WAL 사이드카 접미사. */
export const WAL_SUFFIX = '-wal';
export const SHM_SUFFIX = '-shm';

export function formatTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

/** 복구 전 자동 저장 파일 이름의 접두어. list 에서 종류를 구분할 때도 이 값을 쓴다. */
export const SAFETY_PREFIX = 'sam_before_restore_';

/** sp-migrate.exe 가 업그레이드 직전 백업을 남기는 하위 폴더 이름. */
export const PRE_MIGRATE_DIR = 'pre-migrate';

export type BackupKind = 'manual' | 'safety' | 'pre-migrate' | 'other';

export interface BackupEntry {
  /**
   * `sp-backup.exe restore` 에 그대로 넘길 수 있는 이름.
   * backups/ 기준 상대 경로이며, 하위 폴더는 항상 '/' 로 구분한다 (윈도우 콘솔에서도
   * 역슬래시보다 오타가 적고, restore 쪽이 두 구분자를 모두 받아 준다).
   */
  ref: string;
  absolutePath: string;
  kind: BackupKind;
  sizeBytes: number;
  mtime: Date;
}

const KIND_LABELS: Record<BackupKind, string> = {
  'pre-migrate': '업그레이드 직전 백업 (sp-migrate.exe 가 만든 것)',
  manual: '수동 백업 (sp-backup.exe backup)',
  safety: '복구 전 자동 저장 (sp-backup.exe restore 가 만든 것)',
  other: '기타 파일',
};

/** 목록에 보여줄 순서. 업그레이드 실패 복구가 가장 급한 상황이므로 맨 위에 둔다. */
const KIND_ORDER: BackupKind[] = ['pre-migrate', 'manual', 'safety', 'other'];

function classifyBackup(relativeDir: string, fileName: string): BackupKind {
  if (relativeDir === PRE_MIGRATE_DIR) {
    return 'pre-migrate';
  }
  if (relativeDir !== '') {
    return 'other';
  }
  return fileName.startsWith(SAFETY_PREFIX) ? 'safety' : 'manual';
}

/**
 * 백업 디렉터리 아래의 `.db` 파일을 하위 폴더까지 훑는다.
 *
 * 재귀가 이 함수의 존재 이유다. 예전에는 `backups/` 바로 아래만 읽어서
 * `backups/pre-migrate/` 의 업그레이드 직전 백업이 목록에 아예 나오지 않았다. 업그레이드가
 * 실패한 관리자가 `list` 를 보고 "백업이 없다" 고 판단하는 상황이 실제로 가능했다 —
 * 유일한 복구 수단이 바로 그 폴더에 있는데도.
 *
 * 깊이를 3단계로 제한하는 이유: 관리자가 backups/ 안에 옛 배포본을 통째로 복사해 두는 일이
 * 흔한데, 그 안까지 무한정 들어가면 목록이 쓸모없이 길어진다.
 */
export function collectBackupEntries(backupDir: string, maxDepth = 3): BackupEntry[] {
  const entries: BackupEntry[] = [];

  const walk = (dir: string, relativeDir: string, depth: number): void => {
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        if (depth < maxDepth) {
          walk(full, relativeDir === '' ? dirent.name : `${relativeDir}/${dirent.name}`, depth + 1);
        }
        continue;
      }
      if (!dirent.name.endsWith('.db')) {
        continue;
      }
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      entries.push({
        ref: relativeDir === '' ? dirent.name : `${relativeDir}/${dirent.name}`,
        absolutePath: full,
        kind: classifyBackup(relativeDir, dirent.name),
        sizeBytes: stat.size,
        mtime: stat.mtime,
      });
    }
  };

  walk(backupDir, '', 1);

  // 종류별로 묶고, 같은 종류 안에서는 최신 파일이 위로 오게 한다.
  entries.sort((a, b) => {
    const kindDiff = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    if (kindDiff !== 0) {
      return kindDiff;
    }
    return b.ref.localeCompare(a.ref);
  });
  return entries;
}

/**
 * `list` 출력 문자열.
 *
 * 종류를 소제목으로 묶어 보여주는 이유는 관리자가 "이건 내가 만든 백업인가, 업그레이드가
 * 자동으로 만든 것인가" 를 파일 이름만 보고는 구분할 수 없기 때문이다. 그리고 맨 아래에
 * 실제로 칠 명령을 한 줄 예시로 보여준다 — 하위 폴더가 있는 이름을 그대로 넘겨야 한다는
 * 것을 설명으로 풀어 쓰는 것보다 예시 하나가 확실하다. '>' 표기는 README-exe.txt 관례다.
 */
export function formatBackupList(backupDir: string, entries: BackupEntry[]): string {
  const lines: string[] = [`📁 백업 파일 목록 (${backupDir}):`];
  if (entries.length === 0) {
    lines.push('   (저장된 백업 파일이 없습니다.)');
    return lines.join('\n');
  }

  let currentKind: BackupKind | undefined;
  for (const entry of entries) {
    if (entry.kind !== currentKind) {
      currentKind = entry.kind;
      lines.push('', `  [${KIND_LABELS[entry.kind]}]`);
    }
    const sizeKb = (entry.sizeBytes / 1024).toFixed(1);
    lines.push(`   - ${entry.ref}  (${sizeKb} KB, ${entry.mtime.toLocaleString()})`);
  }

  lines.push(
    '',
    '  복구할 때는 위 목록의 이름을 하위 폴더까지 그대로 넘기십시오.',
    `    > sp-backup.exe restore ${entries[0]!.ref}`,
  );
  return lines.join('\n');
}

/**
 * `restore` 인자를 실제 파일 경로로 바꾼다. 찾지 못하면 undefined.
 *
 * 받아 주는 형태: `sam_x.db`, 확장자를 뺀 `sam_x`, `pre-migrate/sam_x.db`,
 * 윈도우식 `pre-migrate\sam_x.db`, 그리고 절대 경로. list 가 보여준 이름을 복사해 붙였을 때
 * 반드시 통해야 하고, 탐색기 주소창에서 긁어온 전체 경로도 통하는 편이 낫다.
 */
export function resolveBackupPath(backupDir: string, arg: string): string | undefined {
  const normalized = arg.replace(/[\\/]+/g, path.sep);
  const base = path.isAbsolute(normalized) ? normalized : path.resolve(backupDir, normalized);
  const candidates = base.endsWith('.db') ? [base] : [base, `${base}.db`];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // 다음 후보로
    }
  }
  return undefined;
}

/**
 * DB 파일 하나를 사이드카까지 함께 복사한다. 복사한 파일 목록을 돌려준다.
 *
 * WAL 모드에서는 가장 최근에 커밋된 내용이 아직 `.db` 본체가 아니라 `-wal` 에만 들어 있을 수
 * 있다. `.db` 만 복사한 사본은 그래서 "조금 옛날 DB" 가 된다 — 백업으로는 최악의 실패 방식이다.
 * 조용히 몇 건이 빠진 채 복구에 성공한 것처럼 보이기 때문이다.
 *
 * `-shm` 은 복사하지 않는다. 공유 메모리 인덱스일 뿐이라 SQLite 가 `-wal` 로부터 다시 만들며,
 * 낡은 `-shm` 을 끌고 다니면 오히려 혼란만 준다.
 */
export function copyDatabaseWithSidecars(srcDb: string, destDb: string): string[] {
  const copied: string[] = [];
  fs.copyFileSync(srcDb, destDb);
  copied.push(destDb);
  const srcWal = `${srcDb}${WAL_SUFFIX}`;
  if (fs.existsSync(srcWal)) {
    fs.copyFileSync(srcWal, `${destDb}${WAL_SUFFIX}`);
    copied.push(`${destDb}${WAL_SUFFIX}`);
  }
  return copied;
}

export interface RestoreFileResult {
  /** 실제로 만들어진 파일들 (`.db` 와, 백업에 딸려 있었다면 `-wal`) */
  written: string[];
  /** 지운 사이드카들 */
  removed: string[];
}

/**
 * 백업 파일을 DB 위치로 되돌린다.
 *
 * 핵심은 **덮어쓰기 전에 대상의 사이드카를 반드시 정리한다**는 것이다. `.db` 만 덮어쓰고
 * `-wal` 을 남겨두면, SQLite 는 다음 실행에서 그 `-wal`(옛 DB 의 페이지가 들어 있다)을
 * 방금 복구한 파일에 다시 얹는다. 결과는 파일 손상이거나, 관리자가 벗어나려던 바로 그 상태가
 * 조용히 되살아나는 것이다. formatMigrateFailureNotice() 가 "세 파일을 모두 지우고 복원하라"
 * 고 안내하는 이유가 이것이고, 이 함수는 그 안내와 똑같은 일을 대신 해 준다.
 *
 * 백업 쪽에 `-wal` 이 딸려 있으면(= copyDatabaseWithSidecars 가 만든 안전 백업) 그것도 함께
 * 되돌린다. 짝이 맞는 한 쌍이어야 백업 시점의 내용이 그대로 복원된다.
 * `VACUUM INTO` 로 만든 pre-migrate 스냅샷에는 사이드카가 없으므로, 그때는 대상 사이드카를
 * 지우기만 한다.
 */
export function restoreDatabaseFile(backupPath: string, dbPath: string): RestoreFileResult {
  const removed: string[] = [];
  for (const suffix of [WAL_SUFFIX, SHM_SUFFIX]) {
    const sidecar = `${dbPath}${suffix}`;
    if (fs.existsSync(sidecar)) {
      fs.rmSync(sidecar, { force: true });
      removed.push(sidecar);
    }
  }
  const written = copyDatabaseWithSidecars(backupPath, dbPath);
  return { written, removed };
}

export type LockRole = 'server' | 'migrate';

export const LOCK_FILE_NAMES: Record<LockRole, string> = {
  server: 'sp-server.lock',
  migrate: 'sp-migrate.lock',
};

/** 그 잠금을 남긴 실행 파일 이름. 안내 문구가 "무엇을 종료해야 하는지" 를 말할 때 쓴다. */
export const LOCK_OWNER_NAMES: Record<LockRole, string> = {
  server: 'sp-server.exe',
  migrate: 'sp-migrate.exe',
};

/**
 * 잠금 파일 첫 줄의 PID. 파일이 없거나 첫 줄이 숫자가 아니면 undefined.
 * (src/common/process-lock.ts 의 readLock() 과 같은 규약 — 첫 줄이 PID, 둘째 줄부터는 사람용 정보)
 */
export function readLockPid(lockPath: string): number | undefined {
  let contents: string;
  try {
    contents = fs.readFileSync(lockPath, 'utf-8');
  } catch {
    return undefined;
  }
  const firstLine = contents.split(/\r?\n/, 1)[0]?.trim() ?? '';
  if (!/^\d+$/.test(firstLine)) {
    return undefined;
  }
  const pid = Number(firstLine);
  return pid > 0 ? pid : undefined;
}

/**
 * PID 가 살아 있는지 본다. 존재가 아니라 생존으로 판단해야 한다 — 강제 종료로 남은 낡은
 * 잠금 파일이 복구를 영구히 막으면 안 된다.
 * (판정 규칙은 src/common/process-lock.ts 의 isProcessAlive() 와 동일하다.)
 */
export function isProcessAlive(pid: number): { alive: boolean; note?: string } {
  try {
    process.kill(pid, 0);
    return { alive: true };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') {
      return { alive: false };
    }
    if (code === 'EPERM') {
      return { alive: true, note: '다른 사용자 권한으로 실행 중인 것으로 보입니다 (EPERM)' };
    }
    return {
      alive: true,
      note: `프로세스 상태를 확인할 수 없어 실행 중으로 간주했습니다 (${code ?? String(err)})`,
    };
  }
}

export type LockCheck =
  | { kind: 'free' }
  | { kind: 'locked'; role: LockRole; pid: number; lockPath: string; note?: string };

/**
 * DB 디렉터리에 있는 두 잠금 파일을 살펴, 살아 있는 프로세스가 잡고 있으면 그 정보를 돌려준다.
 * 서버 쪽을 먼저 본다 — 두 잠금이 모두 남아 있는 드문 경우에도 관리자가 실제로 종료해야 하는
 * 쪽은 대개 서버다.
 */
export function checkDatabaseLocks(dataDir: string): LockCheck {
  for (const role of ['server', 'migrate'] as LockRole[]) {
    const lockPath = path.join(dataDir, LOCK_FILE_NAMES[role]);
    const pid = readLockPid(lockPath);
    if (pid === undefined) {
      continue;
    }
    const liveness = isProcessAlive(pid);
    if (!liveness.alive) {
      continue;
    }
    return liveness.note === undefined
      ? { kind: 'locked', role, pid, lockPath }
      : { kind: 'locked', role, pid, lockPath, note: liveness.note };
  }
  return { kind: 'free' };
}

const LINE = '====================================================';

/**
 * 서버나 업그레이드가 돌고 있는 상태에서 restore 를 시도한 경우의 안내.
 *
 * 복구는 DB 파일을 통째로 바꿔치는 작업이라, 그 파일을 열어 둔 프로세스가 있으면 복구한
 * 내용이 그대로 덮어써지거나 파일이 깨진다. sp-migrate.exe 가 같은 이유로 이미 막고 있는
 * 것과 같은 위험이다.
 *
 * 잠금 파일 경로를 반드시 실어 준다. 윈도우는 PID 를 재사용하므로 낡은 잠금 파일의 PID 가
 * 이미 다른 프로그램에 배정되어 생존 판정이 거짓 양성을 낼 수 있고, 폐쇄망에는 원격으로
 * 손봐 줄 사람이 없다. 그때 남는 유일한 탈출구가 "이 파일을 지우고 다시 실행" 이다.
 */
export function formatRestoreBlockedNotice(params: {
  role: LockRole;
  pid: number;
  lockPath: string;
  note?: string;
}): string {
  const { role, pid, lockPath, note } = params;
  const owner = LOCK_OWNER_NAMES[role];
  const lines = [
    LINE,
    '  다른 프로그램이 데이터베이스를 쓰고 있습니다',
    LINE,
    '',
    `  실행 중으로 보이는 프로세스: ${owner} (PID ${pid})`,
  ];
  if (note !== undefined) {
    lines.push(`  참고: ${note}`);
  }
  lines.push(
    '',
    '  복구는 데이터베이스 파일을 통째로 바꿔치는 작업입니다. 그 파일을 열어 둔 프로그램이',
    '  있으면 복구한 내용이 곧바로 덮어써지거나 파일이 깨질 수 있어, 아무 작업도 하지 않고',
    '  멈췄습니다. 데이터베이스와 백업 파일 모두 전혀 변경되지 않았습니다.',
    '',
    `  ${owner} 를 종료한 뒤 sp-backup.exe restore 를 다시 실행하십시오.`,
  );
  if (role === 'migrate') {
    lines.push(
      '',
      '  ※ 진행 중인 sp-migrate.exe 를 강제로 종료하거나 그 창을 닫지 마십시오.',
      '     업그레이드는 도중에 끊기면 구조가 절반만 바뀐 상태로 남습니다.',
      '     "업그레이드 완료" 가 표시될 때까지 기다리십시오.',
    );
  }
  lines.push(
    '',
    `  ${owner} 를 이미 종료한 것이 확실하다면, 아래 파일이 지워지지 않고 남은 것입니다.`,
    '  (강제 종료나 콘솔 창을 그냥 닫은 경우 이렇게 남습니다.)',
    '  이 파일을 지운 뒤 sp-backup.exe restore 를 다시 실행하십시오.',
    '',
    `    ${lockPath}`,
    '',
    LINE,
  );
  return lines.join('\n');
}
