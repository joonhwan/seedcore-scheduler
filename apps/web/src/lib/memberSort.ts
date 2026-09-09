/**
 * 멤버 관리 화면의 사람 목록 정렬.
 *
 * 서버가 아니라 화면에서 정렬하는 이유는 대소문자와 한글 정렬 때문이다. SQLite 의
 * ORDER BY 는 바이트 순서라 대소문자를 가려 "Zulu" 가 "alpha" 앞에 온다. Intl 대조는
 * 브라우저에만 있다.
 *
 * 문자 종류의 순서는 대조 규칙을 그대로 따르지 않고 손으로 정한다 — 영문이 앞, 한글이
 * 뒤다(scriptBucket 참고).
 *
 * 후보 목록은 서버가 500명까지만 내려주는데(UsersService.list), 이 프로젝트의 전체
 * 사용자는 150명 이하라 잘리는 일이 없다. 그 한도를 넘기게 되면 "이름순 500명" 이
 * 아니라 "최근 만든 500명을 이름순으로 본 것" 이 되므로 서버 정렬로 옮겨야 한다.
 */

const collator = new Intl.Collator('ko', { sensitivity: 'base', numeric: true });

/** 한글 음절과 자모. 이름의 첫 글자가 여기에 걸리면 한글 이름으로 본다. */
const HANGUL_FIRST = /^[ㄱ-ㆎ가-힣]/;

/**
 * 영문 이름을 앞에, 한글 이름을 뒤에 두기 위한 묶음 번호.
 *
 * 한국어 대조 규칙(Intl.Collator('ko'))은 한글을 라틴 문자보다 **앞에** 놓는다. 이
 * 프로젝트에서는 그 반대가 자연스럽다고 보아, 대조에 맡기지 않고 문자 종류로 먼저 묶는다.
 * 로케일 조정(tailoring)은 엔진의 ICU 판에 따라 달라질 여지가 있는데, 이렇게 명시해 두면
 * 그 영향을 받지 않는다.
 */
function scriptBucket(displayName: string): number {
  return HANGUL_FIRST.test(displayName.trimStart()) ? 1 : 0;
}

/**
 * 이름순 비교. 영문·숫자·기호로 시작하는 이름이 먼저 오고 한글 이름이 뒤에 온다.
 *
 * 이름이 같으면 username 으로 순서를 고정한다 — 동명이인의 순서가 다시 그릴 때마다
 * 바뀌면 고른 줄을 놓친다.
 */
export function compareByDisplayName(
  a: { displayName: string; username?: string },
  b: { displayName: string; username?: string },
): number {
  const byScript = scriptBucket(a.displayName) - scriptBucket(b.displayName);
  if (byScript !== 0) return byScript;
  const byName = collator.compare(a.displayName, b.displayName);
  if (byName !== 0) return byName;
  return collator.compare(a.username ?? '', b.username ?? '');
}

/** 현재 멤버 목록: MANAGER 묶음을 위에 두고, 각 묶음 안에서 이름순. */
export function sortMembersForDisplay<T extends { displayName: string; username: string; role: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'MANAGER' ? -1 : 1;
    return compareByDisplayName(a, b);
  });
}

/** 멤버 추가 후보 목록: 역할이 없으므로 이름순만. */
export function sortUsersByDisplayName<T extends { displayName: string; username: string }>(
  users: readonly T[],
): T[] {
  return [...users].sort(compareByDisplayName);
}
